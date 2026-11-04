"""Observability integrations for RPAForge (issue #846).

OpenTelemetry tracing/metrics (``[otel]`` extra, env-driven) alongside the
default NDJSON EventLogger. See :mod:`rpaforge.observability.otel`.
"""

from rpaforge.observability.otel import (
    configure,
    configure_from_env,
    exit_cm_span,
    is_enabled,
    record_activity_duration,
    record_activity_failure,
    record_queue_depth,
    record_serve_trigger,
    span,
    start_cm_span,
    start_span,
)

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
