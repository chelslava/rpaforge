"""Run all Python benchmarks and write a results JSON (issue #830).

Usage: python benchmarks/run_all.py --output results.json

Output format (consumed by .github/scripts/bench_gate.py):

    {"metrics": {"<name>": {"value": float, "unit": str,
                            "lower_is_better": bool}}}
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from bench_executor import run_benchmark as run_executor  # noqa: E402
from bench_queue import run_benchmark as run_queue  # noqa: E402


def collect_metrics() -> dict[str, dict[str, Any]]:
    """Run every benchmark and key results by metric name."""
    metrics: dict[str, dict[str, Any]] = {}
    for result in [run_executor(), *run_queue()]:
        metrics[result["name"]] = {
            "value": result["value"],
            "unit": result["unit"],
            "lower_is_better": result["lower_is_better"],
        }
    return metrics


def main() -> int:
    """Parse arguments, run benchmarks, write the results file."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="results.json",
        help="path of the results JSON to write",
    )
    args = parser.parse_args()

    payload = {"metrics": collect_metrics()}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
