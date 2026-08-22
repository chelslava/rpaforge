"""
Human-in-the-Loop (HITL) approvals for RPAForge.

Implements issue #746: processes can suspend at an Approval block, persist an
opaque approval token to disk, and resume once a human decides through the
``rpaforge-runner approvals`` CLI.

Reject semantics
----------------
A rejected (or expired) approval raises :class:`ApprovalRejectedError` from the
approval activity. This follows the existing error-handling pattern used by
``Flow.throw_exception``: an uncaught exception fails the current task and the
process; inside a Try-Catch block it deterministically activates the catch
(fallback) branch. The decision is additionally injected into the process
variables ``approval_result`` ("approved" / "rejected") and ``approval_comment``
(when provided) so downstream logic can branch on it.
"""

from rpaforge.hitl.approval import (
    APPROVALS_DIRNAME,
    ApprovalRejectedError,
    ApprovalRequest,
    ApprovalStatus,
    ApprovalStore,
)
from rpaforge.hitl.suspend import (
    APPROVAL_COMMENT_VARIABLE,
    APPROVAL_RESULT_VARIABLE,
    DEFAULT_POLL_INTERVAL_SECONDS,
    EVENT_APPROVAL_REQUESTED,
    EVENT_APPROVAL_RESOLVED,
    HITL_LIBRARY,
    HITL_REQUEST_ACTIVITY,
    decision_variables,
    request_or_adopt,
    wait_for_decision,
)

__all__ = [
    "APPROVALS_DIRNAME",
    "APPROVAL_COMMENT_VARIABLE",
    "APPROVAL_RESULT_VARIABLE",
    "ApprovalRejectedError",
    "ApprovalRequest",
    "ApprovalStatus",
    "ApprovalStore",
    "DEFAULT_POLL_INTERVAL_SECONDS",
    "EVENT_APPROVAL_REQUESTED",
    "EVENT_APPROVAL_RESOLVED",
    "HITL_LIBRARY",
    "HITL_REQUEST_ACTIVITY",
    "decision_variables",
    "request_or_adopt",
    "wait_for_decision",
]
