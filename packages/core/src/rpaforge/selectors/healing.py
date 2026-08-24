"""Self-healing locator recommendations (issue #745).

On selector resolution failure inside a vision-configured run, one D1
grounding attempt proposes a fix. Proposals are durable JSON artifacts
under the run audit directory plus an optional NDJSON event - humans
apply them later. Default ``heal_mode="propose"`` never swaps selectors
mid-run.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("rpaforge.selectors.healing")

#: NDJSON event emitted when a fix proposal is recorded.
EVENT_SELECTOR_FIX_PROPOSED = "selector_fix_proposed"

_HEAL_MODES = ("propose", "apply", "off")


def resolve_heal_mode() -> str:
    """Resolve heal mode from ``RPAFORGE_HEAL_MODE`` (default ``propose``)."""
    raw = os.environ.get("RPAFORGE_HEAL_MODE", "propose").strip().lower()
    return raw if raw in _HEAL_MODES else "propose"


def propose_fix(
    description: str,
    failed_selector: str,
    screenshot_fn: Callable[[], bytes],
    audit_dir: str | Path,
    client_factory: Callable[[], tuple[Any, str]] | None = None,
) -> dict[str, Any] | None:
    """Attempt one grounding proposal; persist it durably.

    Never raises: any failure logs at debug and returns ``None`` so the
    surrounding run continues untouched.

    :returns: Proposal dict with ``old_selector``, ``proposed``,
        ``screenshot_path``, ``created_at`` - or ``None``.
    """
    try:
        from rpaforge.selectors.vlm_grounding import (
            _build_vision_client,
            has_vision_configured,
            make_vlm_resolver,
        )

        if not has_vision_configured():
            return None

        started = time.monotonic()
        screenshot_bytes = screenshot_fn()

        fixes_dir = Path(audit_dir) / "selector-fixes"
        fixes_dir.mkdir(parents=True, exist_ok=True)
        screenshot_path = fixes_dir / f"shot-{int(time.time() * 1000)}.png"
        screenshot_path.write_bytes(screenshot_bytes)

        factory = client_factory or _build_vision_client
        viewport = None
        resolver = make_vlm_resolver(
            description,
            screenshot_fn=lambda: screenshot_bytes,
            client_factory=factory,
            viewport_size=viewport,
        )
        result = resolver(type("S", (), {"weight": 0.0})())
        elapsed_ms = int((time.monotonic() - started) * 1000)

        bbox = [int(round(float(v))) for v in result["bbox"]]
        proposal = {
            "description": description,
            "old_selector": failed_selector,
            "proposed": {
                "bbox": bbox,
                "confidence": result["confidence"],
            },
            "screenshot_path": str(screenshot_path),
            "elapsed_ms": elapsed_ms,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        digest = hashlib.sha256(
            f"{failed_selector}|{description}".encode()
        ).hexdigest()[:12]
        artifact = fixes_dir / f"fix-{digest}.json"
        artifact.write_text(
            json.dumps(proposal, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.warning(
            "SelectorFixProposed: '%s' -> bbox=%s (confidence %.2f); artifact %s",
            failed_selector,
            bbox,
            result["confidence"],
            artifact.name,
        )
        return proposal
    except Exception as exc:  # noqa: BLE001 - proposals must never break runs
        logger.debug("Selector fix proposal skipped: %s", exc)
        return None
