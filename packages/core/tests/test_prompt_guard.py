"""Guard: zero inline prompt constants in AI source (issue #904).

Acceptance criterion "grep-verified": every LLM prompt template must live
in the versioned registry (``rpaforge/prompts/templates/*.json``). This
test scans both packages' source trees for the two shapes an inline
prompt takes — a module-level ``*_PROMPT`` constant and a system-prompt
"You …" opener inside a string literal — and fails when one reappears.
"""

from __future__ import annotations

import re
from pathlib import Path

_SOURCE_ROOTS = [
    Path(__file__).resolve().parents[2] / "core" / "src" / "rpaforge",
    Path(__file__).resolve().parents[2] / "libraries" / "src" / "rpaforge_libraries",
]

# Module-level prompt constant assignments (private naming convention).
_PROMPT_CONSTANT_RE = re.compile(r"(?m)^\s*_[A-Z0-9_]*PROMPT[A-Z0-9_]*\s*=")

# System-prompt openers inside string literals (single or double quoted).
_PROMPT_OPENER_RE = re.compile(
    r"['\"]You (?:are an? |locate |extract |diagnose |route |transcribe )"
)

_ALLOWED_OPENER_FILES = ("templates",)


def _python_sources() -> list[Path]:
    files: list[Path] = []
    for root in _SOURCE_ROOTS:
        files.extend(sorted(root.rglob("*.py")))
    return files


def test_no_inline_prompt_constants() -> None:
    offenders: list[str] = []
    for path in _python_sources():
        source = path.read_text(encoding="utf-8")
        for match in _PROMPT_CONSTANT_RE.finditer(source):
            offenders.append(f"{path}: prompt constant at offset {match.start()}")
    assert not offenders, (
        "Inline prompt constants found; move them into "
        "rpaforge/prompts/templates/ and render via render_prompt(): "
        + "; ".join(offenders)
    )


def test_no_inline_system_prompt_openers() -> None:
    offenders: list[str] = []
    for path in _python_sources():
        if any(part in _ALLOWED_OPENER_FILES for part in path.parts):
            continue
        source = path.read_text(encoding="utf-8")
        for match in _PROMPT_OPENER_RE.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            offenders.append(f"{path}:{line}")
    assert not offenders, (
        "Inline system-prompt openers found ('You are/locate/extract/…'); "
        "move them into rpaforge/prompts/templates/: " + "; ".join(offenders)
    )
