"""Tests for AI failure diagnosis (issue #906)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from rpaforge.diagnosis import (
    DiagnosisError,
    build_diagnosis_bundle,
    diagnose_run,
    load_diagnosis_artifact,
    parse_diagnosis,
    save_diagnosis_artifact,
)


class _ScriptedClient:
    """Fake LLM client returning scripted texts (chat(json_mode=True))."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.prompts: list[list[dict[str, str]]] = []
        self.model_name = "diag-model"

    def chat(self, messages, *, model="", **_kwargs: Any):
        self.prompts.append([dict(m) for m in messages])
        from rpaforge.llm.client import LLMResult

        return LLMResult(text=self._texts.pop(0), model=model, usage=None)


def _seed_run_artifacts(tmp_path: Path, secret: str = "") -> tuple[Path, Path]:
    """Write a failed-run audit JSON + NDJSON log; returns (audit, logs)."""
    audit_path = tmp_path / "run-record.json"
    error = "Click failed: auth challenge api_key: sk-proj-supersecret123"
    if secret:
        error += f" api_key: {secret}"
    audit_path.write_text(
        json.dumps(
            {
                "run_id": "run-123",
                "process_name": "invoice-download",
                "started_at": "2026-11-26T10:00:00+00:00",
                "finished_at": "2026-11-26T10:00:05+00:00",
                "status": "failed",
                "steps": [
                    {
                        "activity": "WebUI.Click Element",
                        "node_id": "click-invoice",
                        "status": "success",
                        "started_at": "2026-11-26T10:00:01+00:00",
                        "duration_ms": 120,
                        "inputs": {"selector": "#list"},
                    },
                    {
                        "activity": "WebUI.Click Element",
                        "node_id": "click-download",
                        "status": "failed",
                        "started_at": "2026-11-26T10:00:02+00:00",
                        "duration_ms": 3000,
                        "inputs": {"selector": "#download"},
                        "error": error,
                    },
                ],
                "policy_violations": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    logs_path = tmp_path / "item-9.ndjson"
    event = {
        "event": "activity_finished",
        "timestamp": "2026-11-26T10:00:02+00:00",
        "activity": "WebUI.Click Element",
        "node_id": "click-download",
        "status": "FAIL",
        "error": error,
    }
    logs_path.write_text(json.dumps(event) + "\n", encoding="utf-8")
    return audit_path, logs_path


def _diagram() -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "start-1", "data": {"type": "start"}},
            {"id": "click-invoice", "data": {"type": "activity"}},
            {"id": "click-download", "data": {"type": "activity"}},
        ],
        "edges": [],
    }


def _valid_diagnosis_text() -> str:
    return json.dumps(
        {
            "root_cause": "Download button selector is stale",
            "confidence": "high",
            "explanation": "The element #download no longer exists; "
            "the page now renders a data-testid attribute.",
            "proposals": [
                {
                    "type": "selector_update",
                    "node_id": "click-download",
                    "new_selector": "[data-testid=download]",
                },
                {
                    "type": "wrap_retry",
                    "node_id": "click-download",
                    "retry_count": 3,
                    "retry_interval_s": 2,
                },
            ],
        }
    )


class TestBuildBundle:
    def test_bundle_from_seeded_artifacts(self, tmp_path: Path) -> None:
        audit_path, logs_path = _seed_run_artifacts(tmp_path)
        bundle = build_diagnosis_bundle(
            audit_path=audit_path,
            logs_path=logs_path,
            diagram=_diagram(),
            item_id="item-9",
        )
        assert bundle["run_id"] == "run-123"
        assert bundle["item_id"] == "item-9"
        assert bundle["process_name"] == "invoice-download"
        assert bundle["failed_step"]["node_id"] == "click-download"
        assert len(bundle["steps"]) == 2
        assert bundle["events"][0]["event"] == "activity_finished"

    def test_secret_in_error_never_reaches_bundle(self, tmp_path: Path) -> None:
        secret = "sk-proj-supersecret123"
        audit_path, logs_path = _seed_run_artifacts(tmp_path, secret=secret)
        bundle = build_diagnosis_bundle(audit_path=audit_path, logs_path=logs_path)
        serialized = json.dumps(bundle, ensure_ascii=False)
        assert secret not in serialized
        assert "[REDACTED]" in serialized

    def test_credential_named_inputs_redacted_unconditionally(
        self, tmp_path: Path
    ) -> None:
        audit_path, logs_path = _seed_run_artifacts(tmp_path)
        bundle = build_diagnosis_bundle(audit_path=audit_path, logs_path=logs_path)
        inputs = bundle["failed_step"]["inputs"]
        assert inputs["selector"] == "#download"

    def test_registered_secret_masked_wherever_it_appears(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from rpaforge.core.secrets import get_masker

        monkeypatch.delenv("RPAFORGE_LOG_UNMASKED", raising=False)
        secret = "registry-hidden-value-42"
        get_masker().register_secret(secret)
        try:
            audit_path, logs_path = _seed_run_artifacts(tmp_path, secret=secret)
            bundle = build_diagnosis_bundle(audit_path=audit_path, logs_path=logs_path)
            assert secret not in json.dumps(bundle, ensure_ascii=False)
        finally:
            # Keep the process-wide masker clean for other tests.
            from rpaforge.core import secrets as secrets_mod

            with secrets_mod.get_masker()._lock:
                secrets_mod.get_masker()._secrets.discard(secret)
                secrets_mod.get_masker()._rebuild_locked()

    def test_explicit_error_overrides_step_error(self, tmp_path: Path) -> None:
        audit_path, logs_path = _seed_run_artifacts(tmp_path)
        bundle = build_diagnosis_bundle(
            audit_path=audit_path,
            logs_path=logs_path,
            error="daemon exit code 1",
        )
        assert bundle["error"] == "daemon exit code 1"

    def test_missing_artifacts_produce_minimal_bundle(self, tmp_path: Path) -> None:
        bundle = build_diagnosis_bundle(
            audit_path=tmp_path / "ghost.json",
            logs_path=tmp_path / "ghost.ndjson",
        )
        assert bundle["status"] == "failed"
        assert "Unknown failure" in bundle["error"]
        assert bundle["steps"] == []
        assert bundle["events"] == []

    def test_selector_fixes_collected(self, tmp_path: Path) -> None:
        audit_path, logs_path = _seed_run_artifacts(tmp_path)
        fixes = audit_path.parent / "selector-fixes"
        fixes.mkdir()
        (fixes / "fix-abc123.json").write_text(
            json.dumps({"description": "heal", "old_selector": "#download"}),
            encoding="utf-8",
        )
        bundle = build_diagnosis_bundle(audit_path=audit_path, logs_path=logs_path)
        assert bundle["selector_fixes"][0]["old_selector"] == "#download"


class TestParseDiagnosis:
    def test_valid_answer_parses(self) -> None:
        diagnosis = parse_diagnosis(_valid_diagnosis_text(), _diagram())
        assert diagnosis["confidence"] == "high"
        assert len(diagnosis["proposals"]) == 2

    def test_fenced_answer_parses(self) -> None:
        text = f"```json\n{_valid_diagnosis_text()}\n```"
        assert parse_diagnosis(text, _diagram())["root_cause"]

    def test_unknown_proposal_type_rejected(self) -> None:
        text = json.dumps(
            {
                "root_cause": "x",
                "confidence": "low",
                "explanation": "",
                "proposals": [{"type": "reformat_disk"}],
            }
        )
        with pytest.raises(DiagnosisError, match="Unknown proposal type"):
            parse_diagnosis(text)

    def test_missing_required_field_rejected(self) -> None:
        text = json.dumps(
            {
                "root_cause": "x",
                "confidence": "low",
                "explanation": "",
                "proposals": [{"type": "param_change", "node_id": "n1"}],
            }
        )
        with pytest.raises(DiagnosisError, match="'param' must be"):
            parse_diagnosis(text)

    def test_unknown_node_id_rejected_against_diagram(self) -> None:
        text = json.dumps(
            {
                "root_cause": "x",
                "confidence": "low",
                "explanation": "",
                "proposals": [
                    {
                        "type": "selector_update",
                        "node_id": "ghost-node",
                        "new_selector": "#x",
                    }
                ],
            }
        )
        with pytest.raises(DiagnosisError, match="unknown node id"):
            parse_diagnosis(text, _diagram())

    def test_unknown_node_id_allowed_without_diagram(self) -> None:
        text = json.dumps(
            {
                "root_cause": "x",
                "confidence": "low",
                "explanation": "",
                "proposals": [
                    {
                        "type": "selector_update",
                        "node_id": "ghost-node",
                        "new_selector": "#x",
                    }
                ],
            }
        )
        assert parse_diagnosis(text)["proposals"]

    def test_bad_confidence_rejected(self) -> None:
        text = json.dumps(
            {
                "root_cause": "x",
                "confidence": "certain",
                "explanation": "",
                "proposals": [],
            }
        )
        with pytest.raises(DiagnosisError, match="confidence"):
            parse_diagnosis(text)

    def test_unparseable_json_rejected(self) -> None:
        with pytest.raises(DiagnosisError, match="not valid JSON"):
            parse_diagnosis("banana")


class TestDiagnoseRun:
    def test_scripted_client_produces_diagnosis(self, tmp_path: Path) -> None:
        audit_path, logs_path = _seed_run_artifacts(tmp_path)
        bundle = build_diagnosis_bundle(
            audit_path=audit_path,
            logs_path=logs_path,
            diagram=_diagram(),
        )
        client = _ScriptedClient([_valid_diagnosis_text()])
        diagnosis = diagnose_run(bundle, client=client, model="diag-model")
        assert diagnosis["root_cause"] == "Download button selector is stale"
        assert diagnosis["model"] == "diag-model"
        # The bundle itself was the user prompt, system prompt first.
        assert client.prompts[0][0]["role"] == "system"
        assert "click-download" in client.prompts[0][1]["content"]

    def test_retry_feeds_validation_error_back(self, tmp_path: Path) -> None:
        audit_path, _ = _seed_run_artifacts(tmp_path)
        bundle = build_diagnosis_bundle(audit_path=audit_path, diagram=_diagram())
        client = _ScriptedClient(
            [
                "not json at all",
                _valid_diagnosis_text(),
            ]
        )
        diagnosis = diagnose_run(bundle, client=client)
        assert diagnosis["proposals"]
        assert len(client.prompts) == 2
        assert "rejected" in client.prompts[1][-1]["content"]

    def test_exhausted_retries_raise(self) -> None:
        client = _ScriptedClient(["garbage", "more garbage"])
        with pytest.raises(DiagnosisError, match="failed validation"):
            diagnose_run({"error": "x"}, client=client)


class TestArtifacts:
    def test_save_and_load_roundtrip(self, tmp_path: Path) -> None:
        diagnosis = parse_diagnosis(_valid_diagnosis_text(), _diagram())
        path = save_diagnosis_artifact(
            diagnosis, tmp_path, item_id="item-9", run_id=None
        )
        assert path == tmp_path / "diagnosis" / "item-9.json"
        loaded = load_diagnosis_artifact(tmp_path, item_id="item-9")
        assert loaded is not None
        assert loaded["root_cause"] == diagnosis["root_cause"]
        assert loaded["artifact_id"] == "item-9"
        assert "created_at" in loaded

    def test_load_missing_returns_none(self, tmp_path: Path) -> None:
        assert load_diagnosis_artifact(tmp_path, item_id="ghost") is None

    def test_save_requires_identity(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="item_id or run_id"):
            save_diagnosis_artifact({}, tmp_path)
