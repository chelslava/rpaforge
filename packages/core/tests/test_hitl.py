"""Tests for the HITL (human-in-the-loop) approval subsystem."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from rpaforge.core.checkpoint import CheckpointData
from rpaforge.hitl.approval import (
    ApprovalRejectedError,
    ApprovalRequest,
    ApprovalStatus,
    ApprovalStore,
)
from rpaforge.hitl.suspend import (
    APPROVAL_COMMENT_VARIABLE,
    APPROVAL_RESULT_VARIABLE,
    decision_variables,
    request_or_adopt,
)


class TestApprovalRequest:
    """Tests for the ApprovalRequest dataclass."""

    def test_defaults_are_pending_with_uuid_token(self):
        request = ApprovalRequest(id="abc-123", question="Ship it?")
        assert request.id == "abc-123"
        assert request.question == "Ship it?"
        assert request.status == ApprovalStatus.PENDING
        assert request.payload == {}
        assert request.created_at
        assert request.comment is None
        assert request.decided_at is None
        assert request.expires_at is None

    def test_to_dict_from_dict_roundtrip(self):
        request = ApprovalRequest(
            id="tok",
            question="Q",
            payload={"amount": 5},
            status=ApprovalStatus.APPROVED,
            comment="ok",
            decided_at="2026-01-01T00:00:00+00:00",
            expires_at=None,
            process_name="Proc",
            node_id="n1",
        )
        restored = ApprovalRequest.from_dict(request.to_dict())
        assert restored == request

    def test_status_string_coerced_to_enum(self):
        request = ApprovalRequest.from_dict({"id": "t", "status": "rejected"})
        assert request.status is ApprovalStatus.REJECTED

    def test_is_expired_false_without_ttl(self):
        request = ApprovalRequest(id="t", question="Q")
        assert request.is_expired() is False

    def test_is_expired_true_after_ttl(self):
        past = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        request = ApprovalRequest(id="t", question="Q", expires_at=past)
        assert request.is_expired() is True

    def test_is_expired_ignores_resolved_requests(self):
        past = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        approved = ApprovalRequest(
            id="t", question="Q", expires_at=past, status=ApprovalStatus.APPROVED
        )
        assert approved.is_expired() is False


class TestApprovalStore:
    """Tests for the file-backed ApprovalStore."""

    @pytest.fixture()
    def store(self, tmp_path: Path) -> ApprovalStore:
        """Return a store rooted in an isolated temporary directory."""
        return ApprovalStore(directory=tmp_path / "approvals")

    def test_create_persists_pending_request(self, store: ApprovalStore):
        request = store.create(
            "Proceed?", payload={"a": 1}, process_name="P", node_id="n"
        )
        assert request.status == ApprovalStatus.PENDING
        loaded = store.get(request.id)
        assert loaded == request

    def test_create_rejects_non_positive_ttl(self, store: ApprovalStore):
        with pytest.raises(ValueError):
            store.create("Q", ttl_seconds=0)

    def test_get_unknown_or_invalid_token_returns_none(self, store: ApprovalStore):
        assert store.get(str("0" * 32)) is None
        assert store.get("../escape") is None
        assert store.get("") is None

    def test_invalid_token_cannot_escape_store_directory(self, tmp_path: Path):
        store = ApprovalStore(directory=tmp_path / "approvals")
        assert store.get("..%2F..%2Fevil") is None
        assert list((tmp_path / "approvals").glob("*")) == []

    def test_resolve_approves_with_comment(self, store: ApprovalStore):
        request = store.create("Q")
        resolved = store.resolve(request.id, approved=True, comment="ship it")
        assert resolved is not None
        assert resolved.status == ApprovalStatus.APPROVED
        assert resolved.comment == "ship it"
        assert resolved.decided_at is not None
        assert store.get(request.id).comment == "ship it"

    def test_resolve_rejects(self, store: ApprovalStore):
        request = store.create("Q")
        resolved = store.resolve(request.id, approved=False)
        assert resolved is not None
        assert resolved.status == ApprovalStatus.REJECTED

    def test_double_resolve_returns_none(self, store: ApprovalStore):
        request = store.create("Q")
        assert store.resolve(request.id, approved=True) is not None
        assert store.resolve(request.id, approved=False) is None

    def test_resolve_unknown_token_returns_none(self, store: ApprovalStore):
        assert store.resolve(str("f" * 32), approved=True) is None

    def test_list_filters_by_status(self, store: ApprovalStore):
        pending = store.create("keep waiting")
        done = store.create("done now")
        store.resolve(done.id, approved=True)
        statuses = {r.id: r.status for r in store.list()}
        assert statuses[pending.id] == ApprovalStatus.PENDING
        assert statuses[done.id] == ApprovalStatus.APPROVED
        listed = store.list(ApprovalStatus.PENDING)
        assert [r.id for r in listed] == [pending.id]

    def test_lazy_expiry_marks_expired_on_read(self, store: ApprovalStore):
        request = store.create("Q", ttl_seconds=0.05)
        import time

        time.sleep(0.1)
        loaded = store.get(request.id)
        assert loaded.status == ApprovalStatus.EXPIRED
        assert store.resolve(request.id, approved=True) is None


class TestSuspendHelpers:
    """Tests for suspension orchestration helpers."""

    def test_request_or_adopt_creates_new_request(self, tmp_path: Path):
        store = ApprovalStore(directory=tmp_path / "a")
        request = request_or_adopt(
            store, question="Q?", process_name="Proc", node_id="n1"
        )
        assert request.status == ApprovalStatus.PENDING
        assert request.process_name == "Proc"
        assert request.node_id == "n1"

    def test_request_or_adopt_reuses_orphaned_pending_token(self, tmp_path: Path):
        store = ApprovalStore(directory=tmp_path / "a")
        orphan = store.create("Q?", process_name="Proc", node_id="n1")
        adopted = request_or_adopt(
            store, question="Q?", process_name="Proc", node_id="n1"
        )
        assert adopted.id == orphan.id

    def test_no_adoption_for_other_process_or_node(self, tmp_path: Path):
        store = ApprovalStore(directory=tmp_path / "a")
        orphan = store.create("Q?", process_name="Other", node_id="n1")
        adopted = request_or_adopt(
            store, question="Q?", process_name="Proc", node_id="n1"
        )
        assert adopted.id != orphan.id

    def test_no_adoption_after_resolution(self, tmp_path: Path):
        store = ApprovalStore(directory=tmp_path / "a")
        orphan = store.create("Q?", process_name="Proc", node_id="n1")
        store.resolve(orphan.id, approved=True)
        adopted = request_or_adopt(
            store, question="Q?", process_name="Proc", node_id="n1"
        )
        assert adopted.id != orphan.id

    def test_decision_variables_mapping(self):
        approved = ApprovalRequest(
            id="t", question="Q", status=ApprovalStatus.APPROVED, comment="fine"
        )
        variables = decision_variables(approved)
        assert variables[APPROVAL_RESULT_VARIABLE] == "approved"
        assert variables[APPROVAL_COMMENT_VARIABLE] == "fine"

        rejected = ApprovalRequest(id="t", question="Q", status=ApprovalStatus.REJECTED)
        variables = decision_variables(rejected)
        assert variables[APPROVAL_RESULT_VARIABLE] == "rejected"
        assert APPROVAL_COMMENT_VARIABLE not in variables


class TestApprovalRejectedError:
    """Reject semantics documented for issue #746."""

    def test_error_is_an_exception_routed_like_throw_exception(self):
        error = ApprovalRejectedError("denied")
        assert isinstance(error, Exception)
        assert str(error) == "denied"


class TestCheckpointTagging:
    """Suspension checkpoints carry the pending approval token."""

    def test_checkpoint_data_roundtrips_approval_token(self):
        data = CheckpointData(process_name="P", state="paused", approval_token="tok")
        restored = CheckpointData.from_dict(data.to_dict())
        assert restored.approval_token == "tok"

    def test_approval_token_defaults_empty_for_legacy_checkpoints(self):
        legacy = CheckpointData.from_dict({"process_name": "old"})
        assert legacy.approval_token == ""
