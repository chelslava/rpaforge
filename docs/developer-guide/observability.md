# Observability (OpenTelemetry)

RPAForge can export distributed traces and metrics over OTLP to any
receiver — Jaeger, Grafana Tempo, Prometheus/Datadog, Honeycomb, an OTel
Collector, ... — while the NDJSON `EventLogger` remains the default,
always-on telemetry. The integration is **additive**: without the `[otel]`
extra or the enable flag, behavior and performance are unchanged.

Introduced in v0.8.0 (issue #846).

## Quick start

```bash
pip install "rpaforge-core[otel]"

export RPAFORGE_OTEL=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # standard OTLP/HTTP
export RPAFORGE_SERVICE_NAME=rpaforge-runner               # optional

rpaforge-runner daemon --queue work --db-path queue.db
```

Spans and metrics stream to the endpoint configured by the standard
`OTEL_*` variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `..._HEADERS`, ...).
The exporter is OTLP/HTTP (protobuf); point a collector at port 4318 or use
your vendor's OTLP endpoint directly.

### Jaeger example

```bash
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
RPAFORGE_OTEL=1 rpaforge-runner run process.process
# open http://localhost:16686 → service rpaforge-runner
```

## Enablement

| Variable | Meaning |
|----------|---------|
| `RPAFORGE_OTEL` | `1`/`true` enables the integration; unset keeps everything no-op. |
| `RPAFORGE_SERVICE_NAME` | `service.name` resource attribute (default `rpaforge-runner`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP receiver endpoint (standard variable). |
| `OTEL_EXPORTER_OTLP_HEADERS` | Additional exporter headers, e.g. vendor tokens. |

With `RPAFORGE_OTEL=1` but the SDK missing, a warning is logged and runs
continue without telemetry (never a hard failure).

## Spans

| Span | Emitted by | Attributes |
|------|-----------|------------|
| `process.run` | runner supervisor (start/end process events) | `rpaforge.process` |
| `task.run` | supervisor task events | `rpaforge.task` |
| `activity.execute` | supervisor activity events | `rpaforge.library`, `rpaforge.activity`, `rpaforge.node_id`, `rpaforge.status`, `rpaforge.error` |
| `serve.trigger` | `rpaforge-runner serve` per accepted trigger request | `rpaforge.queue` |

Hierarchy follows real execution: `process.run` → `task.run` →
`activity.execute`; HITL approval suspension/resume appears as activity
spans around the approval wait. Activity spans end with ERROR status when
the activity failed (message in `rpaforge.error`).

## Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `rpaforge.activity.duration` | histogram (ms) | Per-activity duration, attrs: library/activity/status |
| `rpaforge.activity.failures` | counter | Failed activities, attrs: library/activity |
| `rpaforge.serve.triggers` | counter | Serve triggers accepted/rejected, attrs: queue/accepted |
| `rpaforge.queue.depth` | observable gauge | Pending items per queue (NEW + IN_PROGRESS + RETRIED), sampled each daemon poll |

## Where it wires in

- `ProcessSupervisor.execute` configures OTel from the environment and
  converts executor events into spans/metrics — every runner path (CLI run,
  daemon, serve-triggered runs) is covered in one place.
- `RunnerDaemon.run` samples the queue-depth gauge each poll.
- `ServeApp.trigger` wraps requests in a `serve.trigger` span and counts
  accepted/rejected triggers.

## SDK use

```python
from rpaforge.observability import otel

otel.configure(tracer_provider=my_provider, meter_provider=my_provider)
# or: otel.configure_from_env()
otel.is_enabled()  # -> True
```

Injected providers are used directly (OTel forbids overriding the global
provider within one process); tests use in-memory exporters this way —
see `packages/core/tests/test_observability.py`.

## Dependency policy

The OpenTelemetry SDK/API/exporter live behind the `[otel]` extra
(`opentelemetry-sdk`, `opentelemetry-api`,
`opentelemetry-exporter-otlp-proto-http`), imported lazily like `[llm]` —
zero mandatory new dependencies, zero import cost when disabled.
