"""OpenTelemetry tracing and metrics for RPAForge (issue #846).

Additive observability: with the ``[otel]`` extra installed and
``RPAFORGE_OTEL=1``, spans and metrics are exported over OTLP to any
receiver (Jaeger, Grafana Tempo, Datadog, ...). Without the extra or the
flag, everything is a zero-cost no-op — the NDJSON EventLogger remains the
default telemetry.

Enablement:

- ``RPAFORGE_OTEL=1`` turns the integration on;
- standard ``OTEL_*`` variables configure the exporters (endpoint, headers,
  ...); ``RPAFORGE_SERVICE_NAME`` overrides ``service.name`` (default
  ``rpaforge-runner``).

Spans: ``process.run`` → ``task.run`` → ``activity.execute`` (attributes:
``rpaforge.library``, ``rpaforge.activity``, ``rpaforge.node_id``, status,
retries); serve trigger requests as server spans.

Metrics:
- ``rpaforge.activity.duration`` histogram (ms);
- ``rpaforge.activity.failures`` counter;
- ``rpaforge.serve.triggers`` counter;
- ``rpaforge.queue.depth`` observable gauge (pending items per queue).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import rpaforge.config as config

__all__ = [
    "configure",
    "configure_from_env",
    "exit_cm_span",
    "is_enabled",
    "record_activity_duration",
    "record_activity_failure",
    "record_queue_depth",
    "record_serve_trigger",
    "span",
    "start_cm_span",
    "start_span",
]

logger = logging.getLogger("rpaforge.observability")

_ENV_ENABLE = config.ENV_OTEL
_ENV_SERVICE_NAME = "RPAFORGE_SERVICE_NAME"
_DEFAULT_SERVICE_NAME = "rpaforge-runner"

_state: dict[str, Any] = {"enabled": False}
#: Latest queue-depth observations (queue name -> pending count); read by the
#: observable gauge callback registered in :func:`configure`.
_queue_depths: dict[str, int] = {}


# ---------------------------------------------------------------------------
# No-op shims (zero-dependency default path)
# ---------------------------------------------------------------------------


class _NullSpan:
    def __enter__(self) -> _NullSpan:
        return self

    def __exit__(self, *_exc: Any) -> None:
        return None

    def close(self, _error: str | None = None) -> None:
        return None

    def set_attribute(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def record_exception(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def end(self) -> None:
        return None


class _NullTracer:
    def start_as_current_span(self, *_args: Any, **_kwargs: Any) -> _NullSpan:
        return _NullSpan()

    def start_span(self, *_args: Any, **_kwargs: Any) -> _NullSpan:
        return _NullSpan()


class _NullInstrument:
    def record(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def add(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _NullMeter:
    def create_histogram(self, *_args: Any, **_kwargs: Any) -> _NullInstrument:
        return _NullInstrument()

    def create_counter(self, *_args: Any, **_kwargs: Any) -> _NullInstrument:
        return _NullInstrument()


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def is_enabled() -> bool:
    """True when OTel instrumentation was successfully configured."""
    return bool(_state["enabled"])


def configure_from_env() -> bool:
    """Configure OTel from environment variables (idempotent).

    Returns True when enabled. Requires ``RPAFORGE_OTEL=1``; without the
    ``[otel]`` extra this warns once and stays disabled.
    """
    flag = os.environ.get(_ENV_ENABLE, "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return configure()
    return False


def configure(
    tracer_provider: Any | None = None, meter_provider: Any | None = None
) -> bool:
    """Enable OTel instrumentation (idempotent).

    ``tracer_provider``/``meter_provider`` default to SDK providers wired to
    OTLP exporters configured via standard ``OTEL_*`` variables. Injected
    providers (tests, embedding) are used directly WITHOUT overriding the
    global providers — OTel forbids re-setting them within one process.
    """
    if _state["enabled"]:
        return True
    try:
        from opentelemetry import metrics, trace
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "RPAFORGE_OTEL is enabled but the OpenTelemetry SDK is not "
            "installed — install rpaforge-core[otel] to enable tracing"
        )
        return False

    resource = Resource.create(
        {"service.name": os.environ.get(_ENV_SERVICE_NAME) or _DEFAULT_SERVICE_NAME}
    )
    if tracer_provider is None:
        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    if meter_provider is None:
        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter())],
        )

    if isinstance(tracer_provider, TracerProvider) or tracer_provider is not None:
        # Injected (or freshly built) provider: use it directly instead of
        # the process-global registry — OTel forbids re-setting globals.
        otel_tracer = tracer_provider.get_tracer("rpaforge")
        otel_meter = meter_provider.get_meter("rpaforge")
    else:  # pragma: no cover
        trace.set_tracer_provider(tracer_provider)
        metrics.set_meter_provider(meter_provider)
        otel_tracer = trace.get_tracer("rpaforge")
        otel_meter = metrics.get_meter("rpaforge")

    # Observable gauge: latest known depth per queue (callback-based).
    otel_meter.create_observable_gauge(
        "rpaforge.queue.depth",
        description="Pending work-queue items per queue",
        unit="1",
        callbacks=[_observe_queue_depth],
    )

    _state["enabled"] = True
    _state["tracer"] = otel_tracer
    _state["meter"] = otel_meter
    _state["activity_histogram"] = otel_meter.create_histogram(
        "rpaforge.activity.duration",
        unit="ms",
        description="Activity execution duration",
    )
    _state["failure_counter"] = otel_meter.create_counter(
        "rpaforge.activity.failures",
        description="Activity execution failures",
    )
    _state["trigger_counter"] = otel_meter.create_counter(
        "rpaforge.serve.triggers",
        description="Accepted serve control-plane triggers",
    )
    logger.info("OpenTelemetry instrumentation enabled")
    return True


def _observe_queue_depth(options: Any) -> Iterator[Any]:
    from opentelemetry.metrics import Observation

    for queue_name, depth in list(_queue_depths.items()):
        yield Observation(depth, {"rpaforge.queue": queue_name})


# ---------------------------------------------------------------------------
# Span helpers (no-op safe)
# ---------------------------------------------------------------------------


def _set_attributes(span_obj: Any, attributes: dict[str, Any] | None) -> None:
    for key, value in (attributes or {}).items():
        if isinstance(value, (str, bool, int, float)) or value is None:
            span_obj.set_attribute(key, value)


@contextmanager
def span(name: str, attributes: dict[str, Any] | None = None) -> Iterator[Any]:
    """Start a span scoped to the block (no-op when OTel is disabled).

    Exceptions are recorded on the span and re-raised.
    """
    if not is_enabled():
        yield _NullSpan()
        return
    tracer_obj: Any = _state["tracer"]
    with tracer_obj.start_as_current_span(name) as span_obj:
        _set_attributes(span_obj, attributes)
        try:
            yield span_obj
        except Exception as exc:
            span_obj.record_exception(exc)
            raise


def start_span(name: str, attributes: dict[str, Any] | None = None) -> Any:
    """Start a non-context span (for start/end event pairs); no-op safe.

    The span becomes a child of whatever span is current on the calling
    thread (``process.run``/``task.run`` for activity events).
    """
    if not is_enabled():
        return _NullSpan()
    span_obj: Any = _state["tracer"].start_span(name)
    _set_attributes(span_obj, attributes)
    return span_obj


class _CmSpan:
    """Manually managed current-context span (enter/exit or ``close()``).

    Unlike a ``@contextmanager`` generator this supports explicit, possibly
    out-of-order ``close()`` calls (event-driven spans) without warnings.
    """

    __slots__ = ("_span", "_token", "_closed")

    def __init__(self, span_obj: Any, token: Any) -> None:
        self._span = span_obj
        self._token = token
        self._closed = False

    def __enter__(self) -> Any:
        return self._span

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close(error=str(exc) if exc is not None else None)

    def close(self, error: str | None = None) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if error:
                try:
                    from opentelemetry.trace import Status, StatusCode

                    self._span.set_status(Status(StatusCode.ERROR, error))
                    self._span.set_attribute("rpaforge.error", error)
                except ImportError:  # pragma: no cover
                    pass
        finally:
            try:
                from opentelemetry import context as otel_context

                otel_context.detach(self._token)
            except Exception:  # pragma: no cover
                pass
            self._span.end()


def start_cm_span(name: str, attributes: dict[str, Any] | None = None) -> Any:
    """Return a manually managed span made current on the calling thread.

    The caller enters it on the start event and closes it on the matching
    end event (:func:`exit_cm_span`), so nested spans parent correctly.
    No-op safe: the shim accepts enter/exit regardless.
    """
    if not is_enabled():
        return _NullSpan()
    try:
        from opentelemetry import context as otel_context
        from opentelemetry import trace as otel_trace
    except ImportError:  # pragma: no cover
        return _NullSpan()
    span_obj: Any = _state["tracer"].start_span(name)
    _set_attributes(span_obj, attributes)
    token = otel_context.attach(otel_trace.set_span_in_context(span_obj))
    return _CmSpan(span_obj, token)


def exit_cm_span(cm: Any, error: str | None = None) -> None:
    """Close a :func:`start_cm_span` span; ``error`` marks it as ERROR."""
    if cm is None:
        return
    cm.close(error)


# ---------------------------------------------------------------------------
# Metric helpers (no-op safe)
# ---------------------------------------------------------------------------


def record_activity_duration(
    duration_ms: float, library: str, activity: str, status: str = "pass"
) -> None:
    """Sample ``rpaforge.activity.duration`` (no-op when disabled)."""
    if not is_enabled():
        return
    _state["activity_histogram"].record(
        float(duration_ms),
        {
            "rpaforge.library": library,
            "rpaforge.activity": activity,
            "rpaforge.status": status,
        },
    )


def record_activity_failure(library: str, activity: str) -> None:
    """Increment ``rpaforge.activity.failures`` (no-op when disabled)."""
    if not is_enabled():
        return
    _state["failure_counter"].add(
        1, {"rpaforge.library": library, "rpaforge.activity": activity}
    )


def record_serve_trigger(queue_name: str, accepted: bool = True) -> None:
    """Increment ``rpaforge.serve.triggers`` (no-op when disabled)."""
    if not is_enabled():
        return
    _state["trigger_counter"].add(
        1, {"rpaforge.queue": queue_name, "rpaforge.accepted": accepted}
    )


def record_queue_depth(queue_name: str, depth: int) -> None:
    """Publish the latest pending-item count for ``queue_name``."""
    _queue_depths[queue_name] = int(depth)
