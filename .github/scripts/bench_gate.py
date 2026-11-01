"""Benchmark regression gate (issue #830).

Compares a benchmark results file against a committed baseline and exits 1
on any metric regressing by more than the threshold (default 20%).

Supported result formats:
- ``rpaforge``: {"metrics": {"<name>": {"value": float, "unit": str,
  "lower_is_better": bool}}} — produced by packages/core/benchmarks/run_all.py.
- ``vitest``: vitest benchmark JSON reporter output (bench mean, seconds,
  lower is better) — produced by ``vitest bench --reporter=json``.

Baselines use the same normalized mapping; a missing baseline never fails
the run (first-run bootstrap: commit the printed baseline afterwards).

Usage:
  python bench_gate.py --results results.json --baseline baseline.json \
      --format rpaforge --threshold 0.20 [--update]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

DEFAULT_THRESHOLD = 0.20


def _load_json(path: Path) -> dict[str, Any]:
    """Read a JSON file into a dict."""
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_rpaforge(payload: dict[str, Any]) -> dict[str, tuple[float, bool]]:
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError("rpaforge results JSON has no 'metrics' object")
    normalized: dict[str, tuple[float, bool]] = {}
    for name, entry in metrics.items():
        value = float(entry["value"])
        lower_is_better = bool(entry.get("lower_is_better", False))
        normalized[name] = (value, lower_is_better)
    return normalized


def _normalize_vitest(payload: dict[str, Any]) -> dict[str, tuple[float, bool]]:
    """Extract {task name: (mean latency ms, lower is better)}.

    Vitest 5 bench JSON reporter (jest-style):
    ``testResults[].assertionResults[].benchmarks[].tasks[].latency.mean``.
    """
    normalized: dict[str, tuple[float, bool]] = {}
    for file_entry in payload.get("testResults") or []:
        for assertion in file_entry.get("assertionResults") or []:
            for benchmark in assertion.get("benchmarks") or []:
                for task in benchmark.get("tasks") or []:
                    name = str(task.get("name") or "")
                    mean = (task.get("latency") or {}).get("mean")
                    if not name or mean is None:
                        continue
                    normalized[name] = (float(mean), True)
    if not normalized:
        raise ValueError("vitest results JSON contains no benchmark entries")
    return normalized


def normalize(payload: dict[str, Any], fmt: str) -> dict[str, tuple[float, bool]]:
    """Convert a results payload into {name: (value, lower_is_better)}."""
    if fmt == "rpaforge":
        return _normalize_rpaforge(payload)
    if fmt == "vitest":
        return _normalize_vitest(payload)
    raise ValueError(f"unknown format: {fmt}")


def compare(
    current: dict[str, tuple[float, bool]],
    baseline: dict[str, tuple[float, bool]],
    threshold: float,
) -> list[str]:
    """Return human-readable failure lines for regressed metrics."""
    failures: list[str] = []
    for name, (value, lower_is_better) in current.items():
        if name not in baseline:
            failures.append(
                f"NEW METRIC '{name}' has no baseline entry "
                f"(current={value:.6g}); update the baseline to lock it in."
            )
            continue
        base_value, base_direction = baseline[name]
        if base_direction != lower_is_better:
            failures.append(
                f"METRIC DIRECTION MISMATCH for '{name}': baseline and "
                "results disagree on lower_is_better."
            )
            continue
        if base_value <= 0:
            failures.append(f"INVALID BASELINE for '{name}': {base_value}")
            continue
        change = (value - base_value) / base_value
        regressed = change > threshold if lower_is_better else change < -threshold
        if regressed:
            failures.append(
                f"REGRESSION '{name}': baseline={base_value:.6g} "
                f"current={value:.6g} change={change:+.1%} "
                f"(threshold {threshold:.0%})"
            )
    return failures


def format_baseline(
    current: dict[str, tuple[float, bool]], unit_hint: str = ""
) -> dict[str, dict[str, Any]]:
    """Build a baseline payload from current results."""
    return {
        name: {"value": value, "lower_is_better": lower_is_better, "unit": unit_hint}
        for name, (value, lower_is_better) in current.items()
    }


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", required=True, help="results JSON path")
    parser.add_argument("--baseline", required=True, help="baseline JSON path")
    parser.add_argument("--format", choices=("rpaforge", "vitest"), required=True)
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"allowed regression ratio (default {DEFAULT_THRESHOLD:.0%})",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="write the current results as the new baseline instead of gating",
    )
    args = parser.parse_args()

    results_path = Path(args.results)
    baseline_path = Path(args.baseline)
    current = normalize(_load_json(results_path), args.format)

    if args.update:
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(
            json.dumps(format_baseline(current), indent=2) + "\n", encoding="utf-8"
        )
        print(f"baseline updated: {baseline_path}")
        for name, (value, _) in current.items():
            print(f"  {name}: {value:.6g}")
        return 0

    if not baseline_path.exists():
        print(
            f"WARNING: no baseline at {baseline_path} — recording one now. "
            "Commit it to enable regression gating."
        )
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(
            json.dumps(format_baseline(current), indent=2) + "\n", encoding="utf-8"
        )
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a", encoding="utf-8") as handle:
                handle.write("bootstrapped=true\n")
        return 0

    baseline = _load_json(baseline_path)
    baseline_metrics = {
        name: (float(entry["value"]), bool(entry.get("lower_is_better", False)))
        for name, entry in (baseline.get("metrics") or baseline).items()
        if isinstance(entry, dict) and "value" in entry
    }
    failures = compare(current, baseline_metrics, args.threshold)
    for name, (value, _) in sorted(current.items()):
        base = baseline_metrics.get(name)
        base_str = f"{base[0]:.6g}" if base else "(new)"
        print(f"  {name}: baseline={base_str} current={value:.6g}")
    if failures:
        print(f"\nBENCH GATE FAILED ({len(failures)}):")
        for line in failures:
            print(f"  {line}")
        return 1
    print("bench gate passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
