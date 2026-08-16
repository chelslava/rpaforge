"""Regression tests for ParallelGroup fail-fast behavior."""

from __future__ import annotations

import threading
import time

from rpaforge.core.execution import (
    ActivityCall,
    ExecutionContext,
    ParallelGroup,
    Process,
)
from rpaforge.core.executor import ProcessExecutor


class _ParallelLib:
    calls: list[str] = []
    lock = threading.Lock()

    def fail(self) -> None:
        with self.lock:
            self.calls.append("fail")
        raise RuntimeError("branch failed")

    def slow(self) -> None:
        time.sleep(0.2)
        with self.lock:
            self.calls.append("slow")

    def after(self) -> None:
        with self.lock:
            self.calls.append("after")


def _activity(name: str) -> ActivityCall:
    return ActivityCall(library="_ParallelLib", activity=name)


def test_fail_fast_stops_unstarted_activities_in_other_branches() -> None:
    library = _ParallelLib()
    library.calls = []
    executor = ProcessExecutor()
    executor.register_library("_ParallelLib", library)
    executor._context = ExecutionContext(variables={}, process=Process("parallel"))
    group = ParallelGroup(
        branches=[[_activity("fail")], [_activity("slow"), _activity("after")]],
        node_id="parallel",
        fail_fast=True,
    )

    result = executor._run_parallel_group(group)

    assert result["status"].value == "FAIL"
    assert "fail" in library.calls
    assert "after" not in library.calls


def test_non_fail_fast_allows_other_branch_to_continue() -> None:
    library = _ParallelLib()
    library.calls = []
    executor = ProcessExecutor()
    executor.register_library("_ParallelLib", library)
    executor._context = ExecutionContext(variables={}, process=Process("parallel"))
    group = ParallelGroup(
        branches=[[_activity("fail")], [_activity("slow"), _activity("after")]],
        node_id="parallel",
        fail_fast=False,
    )

    result = executor._run_parallel_group(group)

    assert result["status"].value == "FAIL"
    assert "after" in library.calls
