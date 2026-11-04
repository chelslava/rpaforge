"""Tests for OpenTelemetry instrumentation (issue #846).

Uses in-memory exporters via ``pytest.importorskip`` — the suite runs green
without the ``[otel]`` extra installed (all tests skip), and exercises real
spans/metrics when the SDK is present.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("opentelemetry.sdk")
from opentelemetry.sdk.metrics import MeterProvider  # noqa: E402
from opentelemetry.sdk.metrics.export import (  # noqa: E402
    InMemoryMetricReader,
)
from opentelemetry.sdk.resources import Resource  # noqa: E402
from opentelemetry.sdk.trace import TracerProvider  # noqa: E402
from opentelemetry.sdk.trace.export import SimpleSpanProcessor  # noqa: E402
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (  # noqa: E402
    InMemorySpanExporter,
)

from rpaforge.observability import otel as otel_mod  # noqa: E402


@pytest.fixture()
def otel_enabled(monkeypatch: pytest.MonkeyPatch):
    """Enable OTel with in-memory exporters; tears the global state down."""
    monkeypatch.setattr(otel_mod, "_state", {"enabled": False})
    monkeypatch.setattr(otel_mod, "_queue_depths", {})

    span_exporter = InMemorySpanExporter()
    tracer_provider = TracerProvider(resource=Resource.create({"service": "t"}))
    tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    metric_reader = InMemoryMetricReader()
    meter_provider = MeterProvider(
        resource=Resource.create({"service": "t"}), metric_readers=[metric_reader]
    )

    assert otel_mod.configure(
        tracer_provider=tracer_provider, meter_provider=meter_provider
    )
    yield span_exporter, metric_reader

    with contextlib_suppress():
        tracer_provider.shutdown()
    with contextlib_suppress():
        meter_provider.shutdown()


def contextlib_suppress():
    import contextlib

    return contextlib.suppress(Exception)


def _write_diagram(tmp_path: Path) -> Path:
    nodes = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": "P"}}},
        {
            "id": "n1",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "Rec",
                    "activity": {"name": "Fetch", "library": "Rec"},
                },
                "activity": {"name": "Fetch", "library": "Rec"},
                "activityValues": {},
            },
        },
        {"id": "end", "data": {"blockData": {"type": "end"}}},
    ]
    edges = [
        {"source": "start", "target": "n1", "sourceHandle": None},
        {"source": "n1", "target": "end", "sourceHandle": None},
    ]
    path = tmp_path / "p.process"
    path.write_text(json.dumps({"nodes": nodes, "edges": edges}), encoding="utf-8")
    return path


class StudioEngineLike:
    """Engine double delegating to a real StudioEngine with a test library."""

    def __init__(self) -> None:
        from rpaforge.core.runner import StudioEngine

        self._engine = StudioEngine()
        self._engine.executor.register_library(
            "Rec", type("_R", (), {"fetch": lambda _self: 1})()
        )

    def __getattr__(self, name: str):
        return getattr(self._engine, name)


class TestConfigure:
    def test_disabled_by_default(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.delenv("RPAFORGE_OTEL", raising=False)
        monkeypatch.setattr(otel_mod, "_state", {"enabled": False})
        assert otel_mod.configure_from_env() is False
        assert otel_mod.is_enabled() is False

    def test_enabled_flag_without_sdk_warns(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("RPAFORGE_OTEL", "1")
        monkeypatch.setattr(otel_mod, "_state", {"enabled": False})
        # Null out every SDK submodule configure() imports — parent-module
        # None does not break already-cached submodule imports.
        for submodule in (
            "opentelemetry.sdk",
            "opentelemetry.sdk.metrics",
            "opentelemetry.sdk.metrics.export",
            "opentelemetry.sdk.resources",
            "opentelemetry.sdk.trace",
            "opentelemetry.sdk.trace.export",
            "opentelemetry.exporter.otlp.proto.http.metric_exporter",
            "opentelemetry.exporter.otlp.proto.http.trace_exporter",
        ):
            monkeypatch.setitem(sys.modules, submodule, None)
        assert otel_mod.configure() is False
        assert otel_mod.is_enabled() is False

    def test_idempotent(self, otel_enabled):
        _ = otel_enabled
        assert otel_mod.is_enabled() is True
        assert otel_mod.configure() is True  # no double setup


class TestSpans:
    def test_supervisor_run_emits_span_tree(self, otel_enabled, tmp_path: Path):
        span_exporter, _reader = otel_enabled
        from rpaforge.cli.run import LoadedDiagram
        from rpaforge.runner.supervisor import ProcessSupervisor

        document = json.loads(_write_diagram(tmp_path).read_text(encoding="utf-8"))
        supervisor = ProcessSupervisor(engine_factory=lambda **_kw: StudioEngineLike())
        code, _payload = supervisor.execute(
            LoadedDiagram(
                document=document, variables=[], source=_write_diagram(tmp_path)
            )
        )
        assert code == 0

        span_exporter.force_flush()
        spans = {s.name for s in span_exporter.get_finished_spans()}
        assert "process.run" in spans
        assert "task.run" in spans
        assert "activity.execute" in spans

    def test_activity_span_attributes(self, otel_enabled, tmp_path: Path):
        span_exporter, _reader = otel_enabled
        from rpaforge.cli.run import LoadedDiagram
        from rpaforge.runner.supervisor import ProcessSupervisor

        document = json.loads(_write_diagram(tmp_path).read_text(encoding="utf-8"))
        supervisor = ProcessSupervisor(engine_factory=lambda **_kw: StudioEngineLike())
        code, _payload = supervisor.execute(
            LoadedDiagram(
                document=document, variables=[], source=_write_diagram(tmp_path)
            )
        )
        assert code == 0
        span_exporter.force_flush()
        activity_spans = [
            s
            for s in span_exporter.get_finished_spans()
            if s.name == "activity.execute"
        ]
        assert activity_spans
        attrs = dict(activity_spans[0].attributes or {})
        assert attrs.get("rpaforge.library") == "Rec"
        assert attrs.get("rpaforge.activity") == "Fetch"
        assert attrs.get("rpaforge.node_id") == "n1"

    def test_activity_span_error_status_on_failure(self, otel_enabled, tmp_path: Path):
        span_exporter, _reader = otel_enabled
        from opentelemetry.trace import StatusCode

        from rpaforge.cli.run import LoadedDiagram
        from rpaforge.runner.supervisor import ProcessSupervisor

        document = json.loads(_write_diagram(tmp_path).read_text(encoding="utf-8"))
        engine = StudioEngineLike()
        # Real execution fails: Rec has no registered 'Fetch' instance value...
        engine._engine.executor.register_library(
            "Rec",
            type(
                "_R",
                (),
                {"fetch": lambda _self: (_ for _ in ()).throw(RuntimeError("boom"))},
            )(),
        )
        supervisor = ProcessSupervisor(engine_factory=lambda **_kw: engine)
        code, _payload = supervisor.execute(
            LoadedDiagram(
                document=document, variables=[], source=_write_diagram(tmp_path)
            )
        )
        assert code != 0
        span_exporter.force_flush()
        activity_spans = [
            s
            for s in span_exporter.get_finished_spans()
            if s.name == "activity.execute"
        ]
        assert activity_spans
        assert activity_spans[0].status.status_code == StatusCode.ERROR


class TestMetrics:
    def test_activity_duration_and_failures(self, otel_enabled):
        _exporter, reader = otel_enabled
        otel_mod.record_activity_duration(12.5, "Lib", "Act", status="pass")
        otel_mod.record_activity_failure("Lib", "Act")
        data = reader.get_metrics_data()
        names = {
            m.name
            for rm in data.resource_metrics
            for sm in rm.scope_metrics
            for m in sm.metrics
        }
        assert "rpaforge.activity.duration" in names
        assert "rpaforge.activity.failures" in names

    def test_queue_depth_gauge(self, otel_enabled):
        _exporter, reader = otel_enabled
        otel_mod.record_queue_depth("q1", 7)
        data = reader.get_metrics_data()
        found = None
        for rm in data.resource_metrics:
            for sm in rm.scope_metrics:
                for m in sm.metrics:
                    if m.name == "rpaforge.queue.depth":
                        found = m
        assert found is not None
        points = list(found.data.data_points)
        assert any(
            p.value == 7 and dict(p.attributes or {}).get("rpaforge.queue") == "q1"
            for p in points
        )

    def test_serve_trigger_counter(self, otel_enabled, tmp_path: Path):
        span_exporter, reader = otel_enabled
        from rpaforge.runner.serve import ServeApp, ServeConfig

        app = ServeApp(
            ServeConfig(queue_name="otl", db_path=tmp_path / "q.db", token="t")
        )
        status, _payload = app.trigger(
            {"diagram_path": "x.process"}, authorization_header="Bearer t"
        )
        assert status == 202
        span_exporter.force_flush()
        assert any(
            s.name == "serve.trigger" for s in span_exporter.get_finished_spans()
        )
        data = reader.get_metrics_data()
        names = {
            m.name
            for rm in data.resource_metrics
            for sm in rm.scope_metrics
            for m in sm.metrics
        }
        assert "rpaforge.serve.triggers" in names


class TestNoopPath:
    def test_helpers_are_noop_when_disabled(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(otel_mod, "_state", {"enabled": False})
        with otel_mod.span("x") as span_obj:
            span_obj.set_attribute("k", 1)  # must not raise
        span_obj = otel_mod.start_span("y")
        otel_mod.exit_cm_span(span_obj)
        otel_mod.record_activity_duration(1, "L", "A")
        otel_mod.record_activity_failure("L", "A")
        otel_mod.record_serve_trigger("q")
        otel_mod.record_queue_depth("q", 3)

    def test_cm_span_noop(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(otel_mod, "_state", {"enabled": False})
        cm = otel_mod.start_cm_span("noop")
        cm.__enter__()
        otel_mod.exit_cm_span(cm, error="boom")
