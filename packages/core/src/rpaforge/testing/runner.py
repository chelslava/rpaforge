"""Spec execution engine for ``rpaforge-runner test`` (issue #845).

Runs a :class:`~rpaforge.testing.spec.TestSpec` against a diagram using a
mock-aware executor: every activity is either **mocked** (fixed value,
scripted sequence or raised error), **allowed real** (executed for real), or
**skipped** (not executed at all — the default for anything unmocked, so a
spec can never trigger real side effects). Every dispatch is recorded, node
statuses are collected from executor events, and node coverage is computed
against the diagram's activity nodes.
"""

from __future__ import annotations

import fnmatch
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rpaforge.cli.run import load_diagram
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import ActivityCall, Process
from rpaforge.core.executor import ExecutionError, ProcessExecutor
from rpaforge.core.runner import StudioEngine
from rpaforge.core.validator import ValidationError as DiagramValidationError
from rpaforge.hitl.suspend import HITL_LIBRARY
from rpaforge.testing.assertions import evaluate_assertions
from rpaforge.testing.spec import MockSpec, TestSpec, normalize_activity_key

__all__ = [
    "CallRecord",
    "SpecResult",
    "collect_activity_nodes",
    "run_spec",
    "run_specs",
]


@dataclass
class CallRecord:
    """One recorded activity dispatch (mocked, real or skipped)."""

    activity: str
    node_id: str
    disposition: str  # "mocked" | "real" | "skipped"
    status: str  # "pass" | "fail" | "skipped" | ...
    output: Any | None = None
    error: str | None = None
    times: int = 1


class _MockState:
    """Mutable per-run state behind a frozen :class:`MockSpec`."""

    def __init__(self, spec: MockSpec) -> None:
        self.spec = spec
        self._sequence: deque[Any] = deque(spec.sequence)

    def next(self) -> Any:
        if self.spec.raise_message is not None:
            raise ExecutionError(self.spec.raise_message)
        if self._sequence:
            return self._sequence.popleft()
        if self.spec.sequence:
            return self.spec.sequence[-1]  # exhausted sequence repeats the last
        return self.spec.return_value


class TestExecutor(ProcessExecutor):
    """ProcessExecutor with a mock registry, allow-list and call recording.

    Dispatch precedence: virtual activities (breakpoint/HITL) pass through to
    the engine, then exact mock key, then wildcard mock pattern, then the
    real-activity allow-list, then skip (no execution, no side effects).
    """

    def __init__(
        self,
        mocks: tuple[MockSpec, ...] = (),
        allow_real: tuple[str, ...] = (),
        register_libraries: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        states = [(m, _MockState(m)) for m in mocks]
        self._exact_mocks = {
            m.activity: state
            for m, state in states
            if not any(ch in m.activity for ch in "*?[")
        }
        self._pattern_mocks = [
            (m.activity, state)
            for m, state in states
            if any(ch in m.activity for ch in "*?[")
        ]
        self._allow_real = list(allow_real)
        self.calls: list[CallRecord] = []
        self.node_statuses: dict[str, str] = {}
        #: Nodes actually exercised (mocked or really executed) — coverage
        #: counts these, not merely-reached skipped nodes (issue #845).
        self.covered_nodes: set[str] = set()
        for name, instance in (register_libraries or {}).items():
            self.register_library(name, instance)
        self.add_listener(self._record_node_status)

    def _record_node_status(self, event_type: str, *args: Any) -> None:
        if event_type != "end_activity":
            return
        activity, result = (args + (None, None))[:2]
        if isinstance(activity, ActivityCall) and isinstance(result, dict):
            status = result.get("status")
            value = getattr(status, "value", status)
            self.node_statuses[activity.node_id] = str(value).lower()

    def _match_mock(self, key: str) -> _MockState | None:
        exact = self._exact_mocks.get(key)
        if exact is not None:
            return exact
        for pattern, state in self._pattern_mocks:
            if fnmatch.fnmatchcase(key, pattern):
                return state
        return None

    def _is_allowed_real(self, key: str) -> bool:
        return any(fnmatch.fnmatchcase(key, pattern) for pattern in self._allow_real)

    def _record(
        self,
        activity: str,
        node_id: str,
        disposition: str,
        status: str,
        output: Any | None = None,
        error: str | None = None,
    ) -> None:
        for record in self.calls:
            if (
                record.activity == activity
                and record.node_id == node_id
                and record.disposition == disposition
                and record.status == status
            ):
                record.times += 1
                return
        self.calls.append(
            CallRecord(
                activity=activity,
                node_id=node_id,
                disposition=disposition,
                status=status,
                output=output,
                error=error,
            )
        )

    def _execute_activity(  # noqa: PLR0911
        self,
        library: str,
        activity_name: str,
        *args: Any,
        timeout_ms: int = 0,
        **kwargs: Any,
    ) -> Any:
        if library in ("__bp__", HITL_LIBRARY):
            return super()._execute_activity(
                library, activity_name, *args, timeout_ms=timeout_ms, **kwargs
            )

        key = normalize_activity_key(library, activity_name)
        node_id = ""
        if self._context is not None and self._context.current_activity:
            node_id = self._context.current_activity.node_id

        mock = self._match_mock(key)
        if mock is not None:
            try:
                output = mock.next()
            except ExecutionError as exc:
                if node_id:
                    self.covered_nodes.add(node_id)
                self._record(key, node_id, "mocked", "fail", error=str(exc))
                raise
            if node_id:
                self.covered_nodes.add(node_id)
            self._record(key, node_id, "mocked", "pass", output=output)
            return output

        if self._is_allowed_real(key):
            try:
                output = super()._execute_activity(
                    library, activity_name, *args, timeout_ms=timeout_ms, **kwargs
                )
            except Exception as exc:
                if node_id:
                    self.covered_nodes.add(node_id)
                self._record(key, node_id, "real", "fail", error=str(exc))
                raise
            if node_id:
                self.covered_nodes.add(node_id)
            self._record(key, node_id, "real", "pass", output=output)
            return output

        # Default: skip unmocked activities — no execution, no side effects.
        self._record(key, node_id, "skipped", "skipped")
        return None


def collect_activity_nodes(process: Process) -> set[str]:
    """All non-empty node ids of activities (incl. group children) in a process."""
    nodes: set[str] = set()

    def walk(activity: Any) -> None:
        if isinstance(activity, ActivityCall):
            if activity.node_id:
                nodes.add(activity.node_id)
            return
        children = getattr(activity, "activities", None)
        if children:
            for child in children:
                walk(child)
        for attr in ("try_activities", "catch_activities", "finally_activities"):
            nested = getattr(activity, attr, None)
            if nested:
                for child in nested:
                    walk(child)

    for task in process.tasks:
        for activity in task.activities:
            walk(activity)
    return nodes


@dataclass
class SpecResult:
    """Outcome of one executed spec."""

    name: str
    diagram: str
    spec_path: str | None = None
    passed: bool = False
    failures: list[str] = field(default_factory=list)
    error: str | None = None  # load/conversion failures (spec never ran)
    process_status: str | None = None
    coverage: float = 0.0
    #: Nodes reached by the run (mocked, real or skipped).
    visited_nodes: set[str] = field(default_factory=set)
    #: Nodes actually exercised (mocked or really executed).
    covered_nodes: set[str] = field(default_factory=set)
    total_nodes: set[str] = field(default_factory=set)
    calls: list[CallRecord] = field(default_factory=list)
    variables: dict[str, Any] = field(default_factory=dict)
    elapsed_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "diagram": self.diagram,
            "spec_path": self.spec_path,
            "passed": self.passed,
            "failures": self.failures,
            "error": self.error,
            "process_status": self.process_status,
            "coverage": self.coverage,
            "visited_nodes": sorted(self.visited_nodes),
            "covered_nodes": sorted(self.covered_nodes),
            "total_nodes": sorted(self.total_nodes),
            "calls": [
                {
                    "activity": c.activity,
                    "node_id": c.node_id,
                    "disposition": c.disposition,
                    "status": c.status,
                    "output": c.output,
                    "error": c.error,
                    "times": c.times,
                }
                for c in self.calls
            ],
            "variables": self.variables,
            "elapsed_ms": self.elapsed_ms,
        }


def _build_process(spec: TestSpec) -> Process:
    """Load and convert the spec's diagram, applying spec variables.

    A relative ``diagram`` path resolves against the spec file's directory
    (falls back to the process working directory for inline specs).
    """
    diagram_path = spec.diagram
    if spec.source_path and not Path(diagram_path).is_absolute():
        diagram_path = str(Path(spec.source_path).parent / diagram_path)
    loaded = load_diagram(diagram_path)
    try:
        process = DiagramConverter().convert(loaded.document)
    except (DiagramValidationError, KeyError, TypeError, ValueError) as exc:
        raise SpecRunError(f"diagram conversion failed: {exc}") from exc
    for name, value in spec.variables.items():
        process.set_variable(name, value)
    return process


class SpecRunError(RuntimeError):
    """Raised when a spec cannot be executed (diagram missing/invalid)."""


def run_spec(
    spec: TestSpec,
    min_coverage_default: float | None = None,
    register_libraries: dict[str, Any] | None = None,
) -> SpecResult:
    """Execute one spec and evaluate its assertions.

    ``min_coverage_default`` applies when the spec does not set its own
    ``min_coverage``. ``register_libraries`` maps library names to instances
    made available for real execution (SDK convenience). Test failures
    (assertions/coverage) and execution errors both mark the result failed —
    they differ only in ``error``.
    """
    started = time.perf_counter()
    result = SpecResult(
        name=spec.name, diagram=spec.diagram, spec_path=spec.source_path
    )

    try:
        process = _build_process(spec)
    except Exception as exc:
        result.error = str(exc)
        result.failures.append(result.error or "spec execution failed")
        result.elapsed_ms = int((time.perf_counter() - started) * 1000)
        return result

    executor = TestExecutor(
        mocks=spec.mocks,
        allow_real=spec.allow_real,
        register_libraries=register_libraries,
    )
    engine = StudioEngine(executor=executor)
    engine_result = engine.run(process)

    result.process_status = engine_result.status.value.lower()
    result.variables = dict(engine_result.variables)
    result.calls = list(executor.calls)
    result.visited_nodes = set(executor.node_statuses)
    result.covered_nodes = set(executor.covered_nodes)
    result.total_nodes = collect_activity_nodes(process)
    if result.total_nodes:
        result.coverage = round(
            100.0
            * len(result.covered_nodes & result.total_nodes)
            / len(result.total_nodes),
            1,
        )

    result.failures.extend(
        evaluate_assertions(
            spec.assertions,
            process_status=result.process_status,
            variables=result.variables,
            node_statuses=executor.node_statuses,
            visited_nodes=result.visited_nodes,
        )
    )

    threshold = (
        spec.min_coverage if spec.min_coverage is not None else min_coverage_default
    )
    if threshold is not None and result.coverage < float(threshold):
        result.failures.append(
            f"node coverage {result.coverage:.1f}% is below the "
            f"{float(threshold):.1f}% threshold"
        )

    result.passed = not result.failures
    result.elapsed_ms = int((time.perf_counter() - started) * 1000)
    return result


def run_specs(
    specs: list[TestSpec],
    min_coverage_default: float | None = None,
    register_libraries: dict[str, Any] | None = None,
) -> list[SpecResult]:
    """Run every spec in order; each spec runs in a fresh engine/executor."""
    return [run_spec(spec, min_coverage_default, register_libraries) for spec in specs]
