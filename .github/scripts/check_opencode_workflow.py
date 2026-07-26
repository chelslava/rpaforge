"""Guard the authorization and pinning invariants of opencode.yml."""

from __future__ import annotations

import re
from pathlib import Path

WORKFLOW = Path(__file__).parents[1] / "workflows" / "opencode.yml"


def main() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "author_association" in text
    assert "OWNER" in text and "MEMBER" in text and "COLLABORATOR" in text
    assert "id-token: write" not in text
    assert "@latest" not in text
    assert re.search(r"anomalyco/opencode/github@[0-9a-f]{40}", text)
    assert "cancel-in-progress: true" in text


if __name__ == "__main__":
    main()
