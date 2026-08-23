"""HITL approval requests and their file-backed persistence.

Approval requests are persisted as one JSON document per token under the
per-user application-data directory (``<appdata>/approvals``), resolved via
:func:`rpaforge.config.get_app_data_dir` so the ``RPAFORGE_DATA_DIR``
override is honored. Writes are atomic (temporary file + replace), mirroring
the checkpoint persistence strategy.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import rpaforge.config as config

logger = logging.getLogger("rpaforge")

#: Sub-directory of the app-data dir holding approval request files.
APPROVALS_DIRNAME = "approvals"

_TOKEN_PATTERN = re.compile(r"^[0-9a-fA-F-]{8,64}$")


def _atomic_replace_with_retry(tmp_path: Path, final_path: Path) -> None:
    """Replace *final_path* with *tmp_path*, tolerating Windows file locks.

    On Windows ``Path.replace`` fails with WinError 5/32 while another
    thread holds the target open for reading (our poll loops do exactly
    that). Retry briefly with linear backoff before giving up - readers
    release handles within milliseconds.
    """
    last_error: OSError | None = None
    for attempt in range(20):
        try:
            tmp_path.replace(final_path)
            return
        except PermissionError as err:  # WinError 5
            last_error = err
        except OSError as err:
            if getattr(err, "winerror", None) not in (5, 32):
                raise
            last_error = err
        time.sleep(0.005 * (attempt + 1))
    assert last_error is not None
    raise last_error


class ApprovalStatus(str, Enum):
    """Lifecycle state of an approval request."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ApprovalRejectedError(Exception):
    """Raised when a HITL approval request is rejected or expires.

    Semantics (issue #746 decision): rejection routes execution
    deterministically to the fail/fallback branch by raising from the
    ``__hitl__.Request Approval`` activity — identical to the
    ``Flow.throw_exception`` pattern. Uncaught, it fails the current task and
    the process; inside a Try-Catch block it activates the catch branch. The
    decision is also injected into ``approval_result`` ("rejected") so
    fallback logic can distinguish rejection from other failures.
    """


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ApprovalRequest:
    """A human-in-the-loop approval request.

    The ``id`` is an opaque UUID4 token; it carries no meaning beyond being
    the handle humans use with ``rpaforge-runner approvals approve|reject``
    and the filename under which the request is persisted.
    """

    id: str
    question: str
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=_utcnow_iso)
    status: ApprovalStatus = ApprovalStatus.PENDING
    comment: str | None = None
    decided_at: str | None = None
    expires_at: str | None = None
    process_name: str = ""
    node_id: str = ""

    def __post_init__(self) -> None:
        if isinstance(self.status, str):
            self.status = ApprovalStatus(self.status)

    def to_dict(self) -> dict[str, Any]:
        """Convert to a JSON-serializable dict."""
        data = asdict(self)
        data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ApprovalRequest:
        """Rebuild a request from its persisted dict form."""
        return cls(
            id=str(data.get("id", "")),
            question=str(data.get("question", "")),
            payload=data.get("payload") or {},
            created_at=str(data.get("created_at", "")),
            status=ApprovalStatus(data.get("status", ApprovalStatus.PENDING.value)),
            comment=data.get("comment"),
            decided_at=data.get("decided_at"),
            expires_at=data.get("expires_at"),
            process_name=str(data.get("process_name", "")),
            node_id=str(data.get("node_id", "")),
        )

    def expiry_deadline(self) -> datetime | None:
        """Parse ``expires_at`` into an aware datetime, if set."""
        if not self.expires_at:
            return None
        try:
            parsed = datetime.fromisoformat(self.expires_at)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed

    def is_expired(self, now: datetime | None = None) -> bool:
        """Return True when a still-pending request is past its TTL."""
        if self.status != ApprovalStatus.PENDING:
            return False
        deadline = self.expiry_deadline()
        if deadline is None:
            return False
        return (now or datetime.now(timezone.utc)) >= deadline


class ApprovalStore:
    """File-backed store for approval requests.

    One JSON file per token under the approvals directory. All mutating
    operations are thread-safe and write atomically.
    """

    def __init__(self, directory: str | Path | None = None) -> None:
        base = (
            Path(directory)
            if directory is not None
            else config.get_app_data_dir() / APPROVALS_DIRNAME
        )
        self._directory = base
        self._lock = threading.Lock()
        try:
            self._directory.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise OSError(
                f"Failed to create approvals directory {str(self._directory)!r}: {e}"
            ) from e

    @property
    def directory(self) -> Path:
        """Return the directory backing this store."""
        return self._directory

    @staticmethod
    def _validate_token(token: str) -> bool:
        """Reject tokens that could escape the store directory."""
        return bool(token) and _TOKEN_PATTERN.match(token) is not None

    def _path(self, token: str) -> Path:
        return self._directory / f"{token}.json"

    def _read(self, token: str) -> ApprovalRequest | None:
        if not self._validate_token(token):
            return None
        path = self._path(token)
        try:
            with open(path, encoding="utf-8") as f:
                return ApprovalRequest.from_dict(json.load(f))
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to read approval request %r: %s", token, e)
            return None

    def _write(self, request: ApprovalRequest) -> None:
        path = self._path(request.id)
        tmp_path = path.with_suffix(".tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(request.to_dict(), f, indent=2, ensure_ascii=False)
            _atomic_replace_with_retry(tmp_path, path)
        except OSError as e:
            logger.error("Failed to persist approval request %r: %s", request.id, e)
            raise

    def create(
        self,
        question: str,
        payload: dict[str, Any] | None = None,
        ttl_seconds: float | None = None,
        process_name: str = "",
        node_id: str = "",
    ) -> ApprovalRequest:
        """Create and persist a new pending approval request.

        Args:
            question: Human-readable question shown to the approver.
            payload: Optional JSON-serializable context for the approver.
            ttl_seconds: Optional time-to-live; expired pending tokens are
                deterministically routed to the reject/fallback path.
            process_name: Name of the suspending process (crash recovery).
            node_id: Diagram node that suspended (crash recovery).

        Returns:
            The persisted request.
        """
        expires_at: str | None = None
        if ttl_seconds is not None:
            if ttl_seconds <= 0:
                raise ValueError("ttl_seconds must be greater than zero")
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            ).isoformat()
        request = ApprovalRequest(
            id=str(uuid.uuid4()),
            question=question,
            payload=dict(payload or {}),
            created_at=_utcnow_iso(),
            status=ApprovalStatus.PENDING,
            expires_at=expires_at,
            process_name=process_name,
            node_id=node_id,
        )
        with self._lock:
            self._write(request)
        logger.debug("Approval requested: %s (%s)", request.id, question)
        return request

    def get(self, token: str) -> ApprovalRequest | None:
        """Load a request by opaque token, applying lazy TTL expiry."""
        with self._lock:
            request = self._read(token)
            if request is not None and request.is_expired():
                request.status = ApprovalStatus.EXPIRED
                self._write(request)
            return request

    def list(self, status: ApprovalStatus | str | None = None) -> list[ApprovalRequest]:
        """List requests, newest first, optionally filtered by status."""
        filter_status = ApprovalStatus(status) if status is not None else None
        with self._lock:
            requests: list[ApprovalRequest] = []
            for path in self._directory.glob("*.json"):
                request = self._read(path.stem)
                if request is None:
                    continue
                if request.is_expired():
                    request.status = ApprovalStatus.EXPIRED
                    self._write(request)
                if filter_status is None or request.status == filter_status:
                    requests.append(request)
        requests.sort(key=lambda r: r.created_at, reverse=True)
        return requests

    def resolve(
        self,
        token: str,
        *,
        approved: bool,
        comment: str = "",
    ) -> ApprovalRequest | None:
        """Write a human decision onto a pending request.

        Returns the updated request, or None when the token is unknown,
        invalid, expired, or already resolved.
        """
        with self._lock:
            request = self._read(token)
            if request is None:
                return None
            if request.is_expired():
                request.status = ApprovalStatus.EXPIRED
                self._write(request)
                return None
            if request.status != ApprovalStatus.PENDING:
                return None
            request.status = (
                ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED
            )
            request.comment = comment or None
            request.decided_at = _utcnow_iso()
            self._write(request)
        logger.debug("Approval %s: %s", request.status.value, token)
        return request

    def find_pending(self, process_name: str, node_id: str) -> ApprovalRequest | None:
        """Return the newest pending request for a process/node pair.

        Used on resume: a run that crashed while suspended finds the orphaned
        pending token here instead of minting a duplicate.
        """
        candidates = [
            r
            for r in self.list(ApprovalStatus.PENDING)
            if r.process_name == process_name and r.node_id == node_id
        ]
        return candidates[0] if candidates else None
