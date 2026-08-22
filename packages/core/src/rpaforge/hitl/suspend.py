"""Suspension orchestration for HITL approval blocks.

Bridges the executor's approval activity to the persisted
:class:`~rpaforge.hitl.approval.ApprovalStore`:

1. ``request_or_adopt`` mints a token — or adopts the orphaned pending one
   left behind by a run that crashed while suspended.
2. ``wait_for_decision`` blocks until a human resolves the token through the
   runner CLI (or it expires), polling the store.
3. ``decision_variables`` maps the decision onto process variables:
   ``approval_result`` ("approved" / "rejected") and, when present,
   ``approval_comment``. These are referenced downstream as
   ``${approval_result}`` / ``${approval_comment}``.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from rpaforge.hitl.approval import (
    ApprovalRequest,
    ApprovalStatus,
    ApprovalStore,
)

#: How often the suspension polls the store for a decision.
DEFAULT_POLL_INTERVAL_SECONDS = 0.05

#: Virtual library name intercepted by the executor (precedent: ``__bp__``).
HITL_LIBRARY = "__hitl__"

#: The single activity provided by the virtual HITL library.
HITL_REQUEST_ACTIVITY = "Request Approval"

#: Process variable receiving "approved" / "rejected".
APPROVAL_RESULT_VARIABLE = "approval_result"

#: Process variable receiving the reviewer comment (when provided).
APPROVAL_COMMENT_VARIABLE = "approval_comment"

#: Executor listener event emitted when a process suspends at an approval.
EVENT_APPROVAL_REQUESTED = "approval_requested"

#: Executor listener event emitted once the token leaves the pending state.
EVENT_APPROVAL_RESOLVED = "approval_resolved"


def request_or_adopt(
    store: ApprovalStore,
    *,
    question: str,
    payload: dict[str, Any] | None = None,
    ttl_seconds: float | None = None,
    process_name: str = "",
    node_id: str = "",
) -> ApprovalRequest:
    """Create an approval request or adopt an orphaned pending one.

    If a previous run of the same process suspended at the same node and then
    crashed before the human decided, its pending request is adopted so the
    already-issued token stays valid and no duplicate is created.
    """
    existing = (
        store.find_pending(process_name, node_id) if process_name and node_id else None
    )
    if existing is not None:
        return existing
    return store.create(
        question,
        payload=payload,
        ttl_seconds=ttl_seconds,
        process_name=process_name,
        node_id=node_id,
    )


def wait_for_decision(
    store: ApprovalStore,
    request: ApprovalRequest,
    *,
    poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
    should_cancel: Callable[[], bool] | None = None,
) -> ApprovalRequest | None:
    """Block until ``request`` leaves the pending state.

    Args:
        store: Store backing the request.
        request: The suspended request to watch.
        poll_interval: Seconds between store reads.
        should_cancel: Polled each cycle; when it returns True the wait gives
            up and returns the last-known (still-pending) request so the
            caller can raise its own cancellation.

    Returns:
        The resolved request, or None when cancelled while still pending.
    """
    while True:
        current = store.get(request.id)
        if current is not None and current.status != ApprovalStatus.PENDING:
            return current
        if should_cancel is not None and should_cancel():
            return current
        time.sleep(max(poll_interval, 0.001))


def decision_variables(request: ApprovalRequest) -> dict[str, Any]:
    """Map a decided request onto process variables.

    ``approval_result`` is strictly two-valued — "approved" or "rejected".
    Expired tokens follow reject semantics deterministically (they route to
    the same fail/fallback branch) while their persisted store status remains
    ``EXPIRED``. The comment variable is only set when a reviewer comment was
    recorded.
    """
    approved = request.status == ApprovalStatus.APPROVED
    variables: dict[str, Any] = {
        APPROVAL_RESULT_VARIABLE: "approved" if approved else "rejected",
    }
    if request.comment:
        variables[APPROVAL_COMMENT_VARIABLE] = request.comment
    return variables
