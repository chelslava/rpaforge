"""Executor throughput benchmark (issue #830).

Runs a fixed diagram (TASKS x ACTIVITIES_PER_TASK no-op activities) through
the process executor with an in-memory registered library and reports
activities per second. The workload measures pure dispatch overhead —
argument resolution, task/activity bookkeeping, result aggregation — not
library I/O. An in-process library instance is used deliberately: the
file-based library sandbox validates source on disk and is not part of the
per-activity hot path.
"""

from __future__ import annotations

import time
from typing import Any

from rpaforge import StudioEngine
from rpaforge.core.execution import ExecutionStatus, ProcessBuilder
from rpaforge.core.executor import ProcessExecutor

#: Fixed workload shape. Total activities per run = TASKS * ACTIVITIES_PER_TASK.
TASKS = 5
ACTIVITIES_PER_TASK = 20
#: Number of full process executions measured.
RUNS = 10

METRIC = "executor_activities_per_sec"
UNIT = "ops/s"


class BenchLib:
    """Minimal in-memory library: one no-op activity returning an echo."""

    def noop(self, value: str = "") -> dict[str, Any]:
        """Return the argument unchanged."""
        return {"echo": value}


def build_process() -> Any:
    """Build the fixed benchmark diagram: TASKS x ACTIVITIES_PER_TASK noops."""
    builder = ProcessBuilder("bench-process")
    for task_index in range(TASKS):
        task = builder.add_task(f"Task {task_index}")
        for activity_index in range(ACTIVITIES_PER_TASK):
            task.add_activity(
                "BenchLib", "noop", f"bench {task_index}-{activity_index}"
            )
    return builder.build()


def run_benchmark() -> dict[str, Any]:
    """Execute the workload and return the activities-per-second metric."""
    executor = ProcessExecutor()
    executor.register_library("BenchLib", BenchLib())
    engine = StudioEngine(executor=executor)
    process = build_process()
    started = time.perf_counter()
    for _ in range(RUNS):
        result = engine.run(process)
        if result.status is not ExecutionStatus.PASS:
            raise RuntimeError(f"bench process failed: {result.message}")
    elapsed = time.perf_counter() - started
    total_activities = RUNS * TASKS * ACTIVITIES_PER_TASK
    return {
        "name": METRIC,
        "value": total_activities / elapsed,
        "unit": UNIT,
        "lower_is_better": False,
    }


if __name__ == "__main__":
    import json
    import sys

    print(json.dumps(run_benchmark(), indent=2))
    sys.exit(0)
