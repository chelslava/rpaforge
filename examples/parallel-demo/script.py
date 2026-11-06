"""Parallel Demo — end-to-end RPAForge example (issue #856).

Loads ``process.json`` (a diagram with a parallel block), converts it to a
executable Process via the DiagramConverter, and runs it with the Studio
engine. The two branches execute concurrently — branch 2 finishes while
branch 1 is still sleeping.

Run from the repository root:

    python examples/parallel-demo/script.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.runner import StudioEngine

DIAGRAM_PATH = Path(__file__).resolve().parent / "process.json"


def main() -> int:
    """Convert and run the parallel-demo diagram."""
    diagram = json.loads(DIAGRAM_PATH.read_text(encoding="utf-8"))
    engine = StudioEngine()
    process = DiagramConverter().convert(diagram)
    result = engine.run(process)
    print(f"Status: {result.status}")
    return 0 if result.status.value == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
