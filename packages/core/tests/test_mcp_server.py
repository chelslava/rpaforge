"""Tests for the MCP runner server (issue #854)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from rpaforge.queues.models import QueueItemStatus
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.mcp_server import (
    McpRunnerBackend,
    McpRunnerConfig,
    _bearer_auth_middleware,
)


def _write_process(tmp_path: Path, name: str, filename: str | None = None) -> Path:
    """Write a minimal .process document with the given display name."""
    document = {
        "nodes": [],
        "edges": [],
        "variables": [],
        "metadata": {"name": name, "id": name.lower().replace(" ", "-")},
    }
    target = tmp_path / (filename or f"{name.lower().replace(' ', '-')}.process")
    target.write_text(json.dumps(document), encoding="utf-8")
    return target


def _backend(tmp_path: Path) -> McpRunnerBackend:
    config = McpRunnerConfig(queue_name="mcp-test", db_path=tmp_path / "q.db")
    return McpRunnerBackend(config, store=SQLiteQueueStore(db_path=tmp_path / "q.db"))


class TestListProcesses:
    """Tests for process discovery."""

    def test_lists_process_files_with_metadata_names(self, tmp_path: Path):
        _write_process(tmp_path, "Invoice Bot")
        _write_process(tmp_path, "Backup", filename="b.process")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        processes = backend.list_processes()

        names = {entry["name"] for entry in processes}
        assert names == {"Invoice Bot", "Backup"}
        assert all(Path(entry["path"]).is_file() for entry in processes)

    def test_includes_forge_packages(self, tmp_path: Path):
        (tmp_path / "pkg.forge").write_bytes(b"stub")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        processes = backend.list_processes()

        assert [entry["name"] for entry in processes] == ["pkg"]

    def test_missing_dir_raises(self, tmp_path: Path):
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path / "absent"

        with pytest.raises(FileNotFoundError):
            backend.list_processes()

    def test_resolve_by_name_case_insensitive(self, tmp_path: Path):
        _write_process(tmp_path, "Invoice Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        resolved = backend.resolve_process("invoice bot")

        assert resolved.is_file()

    def test_resolve_explicit_path(self, tmp_path: Path):
        target = _write_process(tmp_path, "Direct", filename="sub.process")
        backend = _backend(tmp_path)

        assert backend.resolve_process(str(target)) == target

    def test_resolve_unknown_name_raises(self, tmp_path: Path):
        backend = _backend(tmp_path)

        with pytest.raises(FileNotFoundError):
            backend.resolve_process("nope")


class TestRunProcess:
    """Tests for run enqueueing with typed-argument validation."""

    def test_enqueues_run_and_returns_item_id(self, tmp_path: Path):
        target = _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        result = backend.run_process("Demo Bot", variables={"customer": "ACME"})

        assert result["status"] == "queued"
        assert result["queue"] == "mcp-test"
        stored = backend.store.get_item(result["item_id"])
        assert stored.payload["diagram_path"] == str(target)
        assert stored.payload["variables"] == {"customer": "ACME"}
        assert stored.status == QueueItemStatus.NEW

    def test_rejects_non_primitive_variables(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        with pytest.raises(ValueError, match="JSON primitives"):
            backend.run_process("Demo Bot", variables={"nested": {"a": 1}})

    def test_rejects_bad_priority(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path

        with pytest.raises(ValueError, match="priority"):
            backend.run_process("Demo Bot", priority="Urgent")

    def test_rejects_unknown_process(self, tmp_path: Path):
        backend = _backend(tmp_path)

        with pytest.raises(FileNotFoundError):
            backend.run_process("ghost")

    def test_invalid_policy_manifest_fails_eagerly(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        broken = tmp_path / "policy.json"
        broken.write_text(json.dumps({"bogus": True}), encoding="utf-8")

        with pytest.raises(ValueError, match="invalid policy manifest"):
            backend.run_process("Demo Bot", policy_path=str(broken))

    def test_valid_policy_manifest_is_queued(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        policy = tmp_path / "policy.json"
        policy.write_text(
            json.dumps({"process": {"allow": ["python"]}}), encoding="utf-8"
        )

        result = backend.run_process("Demo Bot", policy_path=str(policy))

        stored = backend.store.get_item(result["item_id"])
        assert stored.payload["policy"] == str(policy)


class TestRunStatusAndListing:
    """Tests for status observation tools."""

    def test_get_run_status_round_trip(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        queued = backend.run_process("Demo Bot", reference="order-42")

        view = backend.get_run_status(queued["item_id"])

        assert view["status"] == "New"
        assert view["reference"] == "order-42"
        assert view["process"] == str(tmp_path / "demo-bot.process")
        assert "created_at" in view

    def test_get_run_status_unknown_raises(self, tmp_path: Path):
        backend = _backend(tmp_path)

        with pytest.raises(ValueError, match="not found"):
            backend.get_run_status("no-such-id")

    def test_list_runs_newest_first_with_limit(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        for index in range(3):
            backend.run_process("Demo Bot", reference=f"ref-{index}")

        runs = backend.list_runs(limit=2)

        assert len(runs) == 2
        assert [run["reference"] for run in runs] == ["ref-2", "ref-1"]

    def test_list_runs_rejects_bad_limit(self, tmp_path: Path):
        backend = _backend(tmp_path)

        with pytest.raises(ValueError, match="limit"):
            backend.list_runs(limit=0)


class TestCancel:
    """Tests for cancel semantics."""

    def test_cancels_queued_item(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        queued = backend.run_process("Demo Bot")

        view = backend.cancel(queued["item_id"])

        assert view["status"] == "Cancelled"
        stored = backend.store.get_item(queued["item_id"])
        assert stored.status == QueueItemStatus.CANCELLED
        assert stored.error_message == "cancelled via MCP"

    def test_cancelled_item_is_never_picked_up(self, tmp_path: Path):
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.config.processes_dir = tmp_path
        queued = backend.run_process("Demo Bot")
        backend.cancel(queued["item_id"])

        assert backend.store.get_next_item("mcp-test", timeout_seconds=0.2) is None

    def test_cannot_cancel_unknown_item(self, tmp_path: Path):
        backend = _backend(tmp_path)

        with pytest.raises(ValueError, match="not found"):
            backend.cancel("ghost")

    def test_cannot_cancel_in_progress_item(self, tmp_path: Path):
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        _write_process(tmp_path, "Demo Bot")
        backend = _backend(tmp_path)
        backend.store = store
        backend.config.processes_dir = tmp_path
        queued = backend.run_process("Demo Bot")
        store.get_next_item("mcp-test", timeout_seconds=0.1)

        with pytest.raises(ValueError, match="InProgress"):
            backend.cancel(queued["item_id"])


class TestBearerAuthMiddleware:
    """Auth-rejection tests for the streamable HTTP transport."""

    @staticmethod
    async def call_with(token: str, headers: list[tuple[bytes, bytes]]) -> int:
        """Run the middleware over a fake scope; 200 means downstream hit."""
        reached = False
        sent: list[dict[str, Any]] = []

        async def downstream(scope: dict, receive: Any, send: Any) -> None:
            nonlocal reached
            reached = True

        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message: dict[str, Any]) -> None:
            sent.append(message)

        app = _bearer_auth_middleware(downstream, token)
        await app({"type": "http", "headers": headers}, receive, send)
        if reached:
            return 200
        return int(sent[0]["status"])

    def test_missing_authorization_is_rejected_401(self):
        import asyncio

        assert asyncio.run(self.call_with("secret", [])) == 401

    def test_wrong_token_is_rejected_401(self):
        import asyncio

        headers = [(b"authorization", b"Bearer wrong")]
        assert asyncio.run(self.call_with("secret", headers)) == 401

    def test_correct_bearer_passes_through(self):
        import asyncio

        headers = [(b"authorization", b"Bearer secret")]
        assert asyncio.run(self.call_with("secret", headers)) == 200

    def test_non_bearer_scheme_rejected(self):
        import asyncio

        headers = [(b"authorization", b"Basic secret")]
        assert asyncio.run(self.call_with("secret", headers)) == 401


class TestProtocolCompliance:
    """End-to-end protocol tests with the SDK reference client over stdio."""

    def test_generic_client_lists_and_triggers_process(self, tmp_path: Path):
        pytest.importorskip("mcp")
        import anyio

        _write_process(tmp_path, "Demo Bot")
        db_path = tmp_path / "q.db"

        async def scenario() -> None:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            parameters = StdioServerParameters(
                command=sys.executable,
                args=[
                    "-m",
                    "rpaforge.runner.cli",
                    "mcp",
                    "--queue",
                    "e2e",
                    "--db-path",
                    str(db_path),
                    "--processes-dir",
                    str(tmp_path),
                    "-q",
                ],
            )
            async with stdio_client(parameters) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()

                    tools = await session.list_tools()
                    tool_names = {tool.name for tool in tools.tools}
                    assert tool_names == {
                        "list_processes",
                        "run_process",
                        "get_run_status",
                        "list_runs",
                        "cancel",
                    }

                    listed = await session.call_tool("list_processes", {})
                    assert listed.is_error is False
                    assert "Demo Bot" in str(listed.content)

                    run = await session.call_tool(
                        "run_process", {"process": "Demo Bot"}
                    )
                    assert run.is_error is False

                    store = SQLiteQueueStore(db_path=db_path)
                    queued = store.list_items("e2e", limit=1)
                    assert len(queued) == 1
                    assert queued[0].status == QueueItemStatus.NEW
                    assert (
                        queued[0].payload["diagram_path"].endswith("demo-bot.process")
                    )
                    item_id = queued[0].id

                    status = await session.call_tool(
                        "get_run_status", {"item_id": item_id}
                    )
                    assert status.is_error is False
                    assert "New" in str(status.content)

                    cancelled = await session.call_tool("cancel", {"item_id": item_id})
                    assert cancelled.is_error is False

            store = SQLiteQueueStore(db_path=db_path)
            assert store.get_item(item_id).status == QueueItemStatus.CANCELLED
            assert store.get_next_item("e2e", timeout_seconds=0.2) is None

        anyio.run(scenario)

    def test_tool_validation_error_is_error_result(self, tmp_path: Path):
        pytest.importorskip("mcp")
        import anyio

        _write_process(tmp_path, "Demo Bot")
        db_path = tmp_path / "q2.db"

        async def scenario() -> None:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            parameters = StdioServerParameters(
                command=sys.executable,
                args=[
                    "-m",
                    "rpaforge.runner.cli",
                    "mcp",
                    "--queue",
                    "e2e",
                    "--db-path",
                    str(db_path),
                    "--processes-dir",
                    str(tmp_path),
                    "-q",
                ],
            )
            async with stdio_client(parameters) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(
                        "run_process", {"process": "ghost"}
                    )
                    assert result.is_error is True
                    assert "unknown process" in str(result.content)

        anyio.run(scenario)


class TestHttpRefusesToStartWithoutToken:
    """HTTP mode is fail-closed without RPAFORGE_SERVE_TOKEN."""

    def test_http_without_token_raises(self, tmp_path: Path):
        pytest.importorskip("mcp")
        from rpaforge.runner.mcp_server import run_mcp_server

        config = McpRunnerConfig(queue_name="q", db_path=tmp_path / "q.db")
        with pytest.raises(RuntimeError, match="RPAFORGE_SERVE_TOKEN"):
            run_mcp_server(config, transport="http")


class TestCliParser:
    """CLI wiring checks."""

    def test_mcp_subcommand_parses(self):
        from rpaforge.runner.cli import create_parser

        parser = create_parser()
        args = parser.parse_args(["mcp", "--queue", "q", "--transport", "http"])

        assert args.command == "mcp"
        assert args.queue == "q"
        assert args.transport == "http"
        assert args.port == 8766


class TestSubprocessHelp:
    """The subcommand must be discoverable via the real CLI entrypoint."""

    def test_mcp_in_cli_help(self):
        proc = subprocess.run(
            [sys.executable, "-m", "rpaforge.runner.cli", "--help"],
            capture_output=True,
            text=True,
            check=True,
        )
        assert "mcp" in proc.stdout
