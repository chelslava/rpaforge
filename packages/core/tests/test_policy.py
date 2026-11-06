"""Tests for declarative robot permission policies (issue #844)."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from rpaforge.core.policy import (
    EnvironmentPolicy,
    FilesystemPolicy,
    NetworkPolicy,
    Policy,
    PolicyConfigError,
    PolicyViolationError,
    ProcessPolicy,
    _check_environment,
    _path_matches,
    activated_policy,
    load_policy_file,
)

# ---------------------------------------------------------------------------
# Manifest loading / validation
# ---------------------------------------------------------------------------


class TestPolicyLoading:
    def test_loads_full_manifest(self, tmp_path: Path):
        manifest = {
            "filesystem": {"read": ["/data/in/**"], "write": ["/data/out/**"]},
            "network": {"egress": ["api.example.com", "*.internal.corp"]},
            "process": {"allow": ["python.exe"], "deny": ["powershell.exe"]},
            "environment": {"allow": ["PATH", "TEMP"]},
        }
        path = tmp_path / "policy.json"
        path.write_text(json.dumps(manifest), encoding="utf-8")

        policy = load_policy_file(path)

        assert policy.filesystem is not None
        assert policy.filesystem.read == ("/data/in/**",)
        assert policy.filesystem.write == ("/data/out/**",)
        assert policy.filesystem.deny_by_default is True
        assert policy.network is not None
        assert policy.network.egress == ("api.example.com", "*.internal.corp")
        assert policy.process is not None
        assert policy.process.allow == ("python.exe",)
        assert policy.process.deny == ("powershell.exe",)
        assert policy.environment is not None
        assert policy.environment.allow == ("PATH", "TEMP")
        assert policy.source_path == str(path)

    def test_round_trips_through_to_dict(self):
        policy = Policy(
            filesystem=FilesystemPolicy(read=("a/**",)),
            network=NetworkPolicy(egress=("x.com",)),
            process=ProcessPolicy(allow=("py.exe",), deny_by_default=False),
            environment=EnvironmentPolicy(allow=("PATH",)),
            source_path="p.json",
        )
        restored = Policy.from_dict(policy.to_dict())
        assert restored == policy

    def test_missing_file_raises(self, tmp_path: Path):
        with pytest.raises(PolicyConfigError, match="cannot read"):
            load_policy_file(tmp_path / "absent.json")

    def test_invalid_json_raises(self, tmp_path: Path):
        path = tmp_path / "policy.json"
        path.write_text("{not json", encoding="utf-8")
        with pytest.raises(PolicyConfigError, match="invalid JSON"):
            load_policy_file(path)

    def test_unknown_section_raises(self, tmp_path: Path):
        path = tmp_path / "policy.json"
        path.write_text(json.dumps({"gpu": {"allow": ["cuda"]}}), encoding="utf-8")
        with pytest.raises(PolicyConfigError, match="unknown policy sections"):
            load_policy_file(path)

    def test_empty_manifest_raises(self, tmp_path: Path):
        path = tmp_path / "policy.json"
        path.write_text("{}", encoding="utf-8")
        with pytest.raises(PolicyConfigError, match="defines no sections"):
            load_policy_file(path)

    def test_wrong_types_raise(self, tmp_path: Path):
        path = tmp_path / "policy.json"
        path.write_text(
            json.dumps({"filesystem": {"read": "not-a-list"}}), encoding="utf-8"
        )
        with pytest.raises(PolicyConfigError, match="list of strings"):
            load_policy_file(path)

    def test_yaml_manifest_when_pyyaml_available(self, tmp_path: Path):
        pytest.importorskip("yaml")
        path = tmp_path / "policy.yaml"
        path.write_text(
            "network:\n  egress:\n    - api.example.com\n", encoding="utf-8"
        )
        policy = load_policy_file(path)
        assert policy.network is not None
        assert policy.network.egress == ("api.example.com",)


# ---------------------------------------------------------------------------
# Glob matching
# ---------------------------------------------------------------------------


class TestGlobMatching:
    def test_single_star_does_not_cross_segments(self):
        assert _path_matches("/data/*", "/data/file.txt")
        assert not _path_matches("/data/*", "/data/sub/file.txt")

    def test_double_star_crosses_segments(self):
        assert _path_matches("/data/**", "/data/sub/deep/file.txt")
        assert _path_matches("/data/**/*.xlsx", "/data/sub/report.xlsx")
        assert not _path_matches("/data/**/*.xlsx", "/data/sub/report.csv")

    def test_exact_file_pattern(self):
        assert _path_matches("/data/report.xlsx", "/data/report.xlsx")
        assert not _path_matches("/data/report.xlsx", "/data/other.xlsx")


# ---------------------------------------------------------------------------
# Audit-hook enforcement (in-process)
# ---------------------------------------------------------------------------


def _fs_policy(tmp_path: Path, **kwargs) -> Policy:
    return Policy(
        filesystem=FilesystemPolicy(
            read=[str(tmp_path / "in" / "**")] + list(kwargs.get("read_extra", [])),
            write=[str(tmp_path / "out" / "**")],
            deny_by_default=kwargs.get("deny_by_default", True),
        )
    )


class TestFilesystemEnforcement:
    def test_in_policy_read_and_write_allowed(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)
        read_target = tmp_path / "in" / "data.txt"
        read_target.parent.mkdir(parents=True, exist_ok=True)
        read_target.write_text("x", encoding="utf-8")
        write_target = tmp_path / "out" / "result.txt"
        write_target.parent.mkdir(parents=True, exist_ok=True)
        with activated_policy(policy):
            assert read_target.read_text(encoding="utf-8") == "x"
            write_target.write_text("y", encoding="utf-8")

    def test_out_of_policy_read_blocked(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)
        secret = tmp_path / "secret.txt"
        secret.write_text("top secret", encoding="utf-8")
        with activated_policy(policy), pytest.raises(PolicyViolationError) as excinfo:
            secret.read_text(encoding="utf-8")
        assert excinfo.value.kind == "filesystem"
        assert excinfo.value.rule == "read allowlist"
        assert excinfo.value.to_dict()["error"] == "PolicyViolationError"

    def test_out_of_policy_write_blocked(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)
        target = tmp_path / "elsewhere" / "evil.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        with activated_policy(policy), pytest.raises(PolicyViolationError):
            target.write_text("x", encoding="utf-8")

    def test_deny_by_default_false_is_observe_mode(self, tmp_path: Path):
        policy = _fs_policy(tmp_path, deny_by_default=False)
        secret = tmp_path / "secret.txt"
        secret.write_text("x", encoding="utf-8")
        with activated_policy(policy):
            assert secret.read_text(encoding="utf-8") == "x"

    def test_os_delete_blocked(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)
        victim = tmp_path / "victim.txt"
        victim.write_text("x", encoding="utf-8")
        with activated_policy(policy), pytest.raises(PolicyViolationError):
            os.remove(victim)

    def test_no_policy_active_is_passthrough(self, tmp_path: Path):
        secret = tmp_path / "secret.txt"
        secret.write_text("x", encoding="utf-8")
        assert secret.read_text(encoding="utf-8") == "x"


class TestNetworkEnforcement:
    def test_out_of_policy_connect_blocked(self):
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            with activated_policy(policy), pytest.raises(PolicyViolationError):
                sock.connect(("203.0.113.10", 443))
        finally:
            sock.close()

    def test_in_policy_connect_not_blocked_by_hook(self):
        # The hook fires before the syscall; connect to an unreachable but
        # allowlisted address and assert the failure is NOT a policy violation.
        policy = Policy(network=NetworkPolicy(egress=("203.0.113.10", "*")))
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        try:
            with activated_policy(policy):
                try:
                    sock.connect(("203.0.113.10", 9))  # discard port, unroutable
                except PolicyViolationError:  # pragma: no cover
                    pytest.fail("in-policy connect must not be blocked")
                except OSError:
                    pass  # expected: connection refused/unreachable, not policy
        finally:
            sock.close()

    def test_subdomain_suffix_matching(self):
        from rpaforge.core.policy import _host_matches

        assert _host_matches("example.com", "api.example.com")
        assert _host_matches("example.com", "example.com")
        assert not _host_matches("api.example.com", "example.com")
        assert _host_matches("*.internal.corp", "svc.internal.corp")
        assert _host_matches("*", "anything.example.net")


class TestProcessEnforcement:
    def test_out_of_policy_spawn_blocked(self):
        policy = Policy(process=ProcessPolicy(allow=["definitely-not-real.exe"]))
        with activated_policy(policy), pytest.raises(PolicyViolationError) as excinfo:
            subprocess.Popen([sys.executable, "-c", "pass"])
        assert excinfo.value.kind == "process"

    def test_in_policy_spawn_allowed(self):
        policy = Policy(process=ProcessPolicy(allow=[os.path.basename(sys.executable)]))
        with activated_policy(policy):
            proc = subprocess.run(
                [sys.executable, "-c", "print('ok')"],
                capture_output=True,
                text=True,
                timeout=30,
            )
        assert proc.returncode == 0

    def test_deny_list_wins(self):
        policy = Policy(process=ProcessPolicy(deny=[os.path.basename(sys.executable)]))
        with activated_policy(policy), pytest.raises(PolicyViolationError):
            subprocess.Popen([sys.executable, "-c", "pass"])

    def test_empty_allowlist_blocks_all_spawns(self):
        policy = Policy(process=ProcessPolicy())
        with activated_policy(policy), pytest.raises(PolicyViolationError):
            subprocess.Popen([sys.executable, "-c", "pass"])


class TestEnvironmentEnforcement:
    def test_out_of_policy_env_blocked(self):
        policy = Policy(environment=EnvironmentPolicy(allow=("PATH",)))
        with activated_policy(policy), pytest.raises(PolicyViolationError) as excinfo:
            subprocess.Popen(
                [sys.executable, "-c", "pass"], env={"SOME_SECRET_VAR": "1"}
            )
        assert excinfo.value.kind == "environment"

    def test_in_policy_env_check_passes(self):
        policy = Policy(environment=EnvironmentPolicy(allow=("path", "TEMP")))
        _check_environment(policy.environment, {"Path": "/bin", "TEMP": "/tmp"})

    def test_inherited_env_violates_when_not_allowlisted(self):
        policy = Policy(environment=EnvironmentPolicy(allow=("NOT_IN_ENV_VAR",)))
        with pytest.raises(PolicyViolationError) as excinfo:
            _check_environment(policy.environment, None)
        assert "PATH" in excinfo.value.resource.upper() or excinfo.value.resource


# ---------------------------------------------------------------------------
# Executor integration
# ---------------------------------------------------------------------------


class _FsLib:
    """Test library whose activity reads whatever path it is given."""

    def read_file(self, path: str) -> str:
        with open(path, encoding="utf-8") as handle:
            return handle.read()


class TestExecutorPolicyIntegration:
    def _build_process(self, tmp_path: Path):
        from rpaforge.core.execution import ProcessBuilder

        secret = tmp_path / "secret.txt"
        secret.write_text("leaked", encoding="utf-8")

        builder = ProcessBuilder("Policy Test")
        builder.add_task("Read Secret").add_activity(
            "TestFsLib", "Read File", path=str(secret)
        )
        process = builder.build()
        return process, secret

    def _register_and_run(self, process, policy: Policy | None):
        from rpaforge.core.executor import ProcessExecutor
        from rpaforge.core.runner import StudioEngine

        executor = ProcessExecutor(policy=policy)
        executor.register_library("TestFsLib", _FsLib())
        engine = StudioEngine(executor=executor, policy=policy)
        return engine.run(process)

    def test_violation_fails_run_with_typed_details(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)  # allowlist covers only in/out dirs
        process, _secret = self._build_process(tmp_path)

        result = self._register_and_run(process, policy)

        assert result.status.value.lower() == "fail"
        assert result.task_results
        activities = result.task_results[0].get("activities") or []
        assert activities
        step = activities[0]
        assert "Policy violation [filesystem]" in str(step.get("error"))
        assert step.get("policy_violation", {}).get("kind") == "filesystem"

    def test_violation_surfaced_via_listener_event(self, tmp_path: Path):
        policy = _fs_policy(tmp_path)
        process, _secret = self._build_process(tmp_path)

        from rpaforge.core.executor import ProcessExecutor
        from rpaforge.core.runner import StudioEngine

        executor = ProcessExecutor(policy=policy)
        executor.register_library("TestFsLib", _FsLib())
        events: list[tuple[str, tuple]] = []
        executor.add_listener(
            lambda event_type, *payload: events.append((event_type, payload))
        )
        engine = StudioEngine(executor=executor, policy=policy)
        engine.run(process)

        end_events = [payload for name, payload in events if name == "end_activity"]
        assert end_events
        violations = [
            payload
            for payload in end_events
            if any(isinstance(a, dict) and a.get("policy_violation") for a in payload)
        ]
        assert violations

    def test_without_policy_run_succeeds(self, tmp_path: Path):
        process, secret = self._build_process(tmp_path)
        result = self._register_and_run(process, None)
        assert result.status.value.lower() == "pass"
        assert secret.exists()

    def test_in_policy_run_succeeds(self, tmp_path: Path):
        process, secret = self._build_process(tmp_path)
        allowed = Policy(filesystem=FilesystemPolicy(read=[str(tmp_path / "**")]))
        result = self._register_and_run(process, allowed)
        assert result.status.value.lower() == "pass"


# ---------------------------------------------------------------------------
# Subprocess worker enforcement
# ---------------------------------------------------------------------------


class TestSubprocessWorkerPolicy:
    def test_worker_blocks_out_of_policy_read(self, tmp_path: Path):
        from rpaforge.core.subprocess_executor import SubprocessExecutor

        secret = tmp_path / "secret.txt"
        secret.write_text("top", encoding="utf-8")
        policy = Policy(filesystem=FilesystemPolicy(read=[str(tmp_path / "in" / "**")]))
        with SubprocessExecutor(policy=policy) as ex:
            with pytest.raises(PolicyViolationError):
                ex._execute_in_subprocess(
                    __name__, "_FsLib", "read_file", (str(secret),), {}
                )

    def test_worker_allows_in_policy_read(self, tmp_path: Path):
        from rpaforge.core.subprocess_executor import SubprocessExecutor

        allowed = tmp_path / "in" / "data.txt"
        allowed.parent.mkdir(parents=True, exist_ok=True)
        allowed.write_text("visible", encoding="utf-8")
        policy = Policy(filesystem=FilesystemPolicy(read=[str(tmp_path / "in" / "**")]))
        with SubprocessExecutor(policy=policy) as ex:
            result = ex._execute_in_subprocess(
                __name__, "_FsLib", "read_file", (str(allowed),), {}
            )
        assert result == "visible"

    def test_worker_without_policy_unchanged(self, tmp_path: Path):
        from rpaforge.core.subprocess_executor import SubprocessExecutor

        secret = tmp_path / "secret.txt"
        secret.write_text("top", encoding="utf-8")
        with SubprocessExecutor() as ex:
            result = ex._execute_in_subprocess(
                __name__, "_FsLib", "read_file", (str(secret),), {}
            )
        assert result == "top"

    def test_worker_timeout_path_enforces_policy(self, tmp_path: Path):
        from rpaforge.core.subprocess_executor import SubprocessExecutor

        secret = tmp_path / "secret.txt"
        secret.write_text("top", encoding="utf-8")
        policy = Policy(filesystem=FilesystemPolicy(read=[str(tmp_path / "in" / "**")]))
        with SubprocessExecutor(policy=policy) as ex:
            with pytest.raises(PolicyViolationError):
                ex.execute_with_timeout(
                    __name__, "_FsLib", "read_file", str(secret), timeout_ms=10000
                )


# ---------------------------------------------------------------------------
# Runner integration: serve, daemon item mapping, CLI
# ---------------------------------------------------------------------------


class TestServePolicyHeader:
    def _app(self, tmp_path: Path):
        from rpaforge.runner.serve import ServeApp, ServeConfig

        config = ServeConfig(queue_name="q", db_path=tmp_path / "queue.db", token="t")
        return ServeApp(config)

    def test_invalid_policy_header_rejected(self, tmp_path: Path):
        app = self._app(tmp_path)
        status, payload = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer t",
            policy_header=str(tmp_path / "absent.json"),
        )
        assert status == 400
        assert "invalid policy manifest" in payload["error"]

    def test_valid_policy_header_enqueued(self, tmp_path: Path):
        policy_path = tmp_path / "policy.json"
        policy_path.write_text(
            json.dumps({"network": {"egress": ["example.com"]}}), encoding="utf-8"
        )
        app = self._app(tmp_path)
        status, payload = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer t",
            policy_header=str(policy_path),
        )
        assert status == 202
        item = app.store.get_next_item("q", timeout_seconds=0.0)
        assert item is not None
        assert item.payload.get("policy") == str(policy_path)


class TestDaemonPolicyMapping:
    def test_payload_policy_mapped_to_item(self, tmp_path: Path):
        from rpaforge.queues.sqlite_store import SQLiteQueueStore
        from rpaforge.runner.daemon import SQLiteEmbeddedQueue

        store = SQLiteQueueStore(db_path=tmp_path / "queue.db")
        store.add_item(
            "q",
            payload={"diagram_path": "a.process", "policy": "/p/policy.json"},
        )
        backend = SQLiteEmbeddedQueue(db_path=tmp_path / "queue.db")
        item = backend.fetch_next_item("q")
        assert item is not None
        assert item.policy_path == "/p/policy.json"

    def test_item_without_policy_has_none(self, tmp_path: Path):
        from rpaforge.queues.sqlite_store import SQLiteQueueStore
        from rpaforge.runner.daemon import SQLiteEmbeddedQueue

        store = SQLiteQueueStore(db_path=tmp_path / "queue.db")
        store.add_item("q", payload={"diagram_path": "a.process"})
        backend = SQLiteEmbeddedQueue(db_path=tmp_path / "queue.db")
        item = backend.fetch_next_item("q")
        assert item is not None
        assert item.policy_path is None


class TestCliPolicyResolution:
    def test_flag_precedes_env(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        from rpaforge.runner.cli import _resolve_policy

        env_policy = tmp_path / "env.json"
        env_policy.write_text(
            json.dumps({"network": {"egress": ["env.com"]}}), encoding="utf-8"
        )
        flag_policy = tmp_path / "flag.json"
        flag_policy.write_text(
            json.dumps({"network": {"egress": ["flag.com"]}}), encoding="utf-8"
        )
        monkeypatch.setenv("RPAFORGE_POLICY", str(env_policy))

        resolved = _resolve_policy(str(flag_policy))
        assert resolved is not None
        assert resolved.network is not None
        assert resolved.network.egress == ("flag.com",)

    def test_env_used_when_no_flag(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        from rpaforge.runner.cli import _resolve_policy

        env_policy = tmp_path / "env.json"
        env_policy.write_text(
            json.dumps({"network": {"egress": ["env.com"]}}), encoding="utf-8"
        )
        monkeypatch.setenv("RPAFORGE_POLICY", str(env_policy))

        resolved = _resolve_policy(None)
        assert resolved is not None
        assert resolved.network is not None
        assert resolved.network.egress == ("env.com",)

    def test_none_when_unset(self, monkeypatch: pytest.MonkeyPatch):
        from rpaforge.runner.cli import _resolve_policy

        monkeypatch.delenv("RPAFORGE_POLICY", raising=False)
        assert _resolve_policy(None) is None

    def test_run_with_broken_policy_exits_config_error(self, tmp_path: Path):
        from rpaforge.runner.cli import main

        code = main(
            ["run", "does-not-matter.process", "--policy", str(tmp_path / "no.json")]
        )
        assert code == 4  # RunExitCode.CONFIGURATION_ERROR

    def test_run_with_invalid_policy_content_exits_config_error(self, tmp_path: Path):
        from rpaforge.runner.cli import main

        bad = tmp_path / "bad.json"
        bad.write_text("{}", encoding="utf-8")  # empty manifest
        code = main(["run", "does-not-matter.process", "--policy", str(bad)])
        assert code == 4


# ---------------------------------------------------------------------------
# Thread propagation (ThreadingTimeoutHandler)
# ---------------------------------------------------------------------------


class TestThreadPropagation:
    def test_policy_applies_in_timeout_handler_thread(self, tmp_path: Path):
        """The ThreadingTimeoutHandler must propagate the active policy into
        its worker thread via contextvars.copy_context()."""
        from rpaforge.core.executor import ProcessExecutor, ThreadingTimeoutHandler

        secret = tmp_path / "secret.txt"
        secret.write_text("x", encoding="utf-8")
        policy = Policy(filesystem=FilesystemPolicy(read=[str(tmp_path / "in" / "**")]))
        executor = ProcessExecutor(policy=policy)
        executor.register_library("TestFsLib", _FsLib())

        lib = _FsLib()

        def call() -> str:
            return lib.read_file(str(secret))

        with activated_policy(policy):
            handler = ThreadingTimeoutHandler()
            with pytest.raises(PolicyViolationError):
                handler.execute_with_timeout(call, (), 5000)

class TestDnsPinning:
    """Rebind mitigation for hostname egress (issue #862).

    Checks run against ``_check_network`` directly: the audit hook raises
    ``socket.connect`` only after C-level resolution succeeds, so real
    sockets cannot exercise the DNS-failure path (their gaierror is the
    natural fail-closed outcome). The hook -> handler chain itself is
    covered by the IP-literal enforcement tests above.
    """

    def _fake_getaddrinfo(self, answers):
        """getaddrinfo double returning canned address lists in sequence."""
        calls = {"n": 0}

        def fake(hostname, port):
            index = min(calls["n"], len(answers) - 1)
            calls["n"] += 1
            ips = answers[index]
            return [
                (2, 1, 6, "", (ip, 0)) if ":" not in ip
                else (10, 1, 6, "", (ip, 0))
                for ip in ips
            ]

        return fake, calls

    def _check(self, policy, host, port=443):
        from rpaforge.core.policy import _check_network

        _check_network(policy.network, (host, port))

    def test_in_policy_hostname_resolves_public_allowed(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        fake, _calls = self._fake_getaddrinfo([["93.184.216.34"]])
        monkeypatch.setattr(policy_module.socket, "getaddrinfo", fake)
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        self._check(policy, "api.example.com")  # must not raise

    def test_rebind_to_private_detected(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        # First resolution (pin) is public; the connect-time resolution
        # rebinding to the cloud metadata range must be refused.
        fake, _calls = self._fake_getaddrinfo(
            [["93.184.216.34"], ["169.254.169.254"]]
        )
        monkeypatch.setattr(policy_module.socket, "getaddrinfo", fake)
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        with pytest.raises(PolicyViolationError, match="non-pinned"):
            self._check(policy, "api.example.com")

    def test_dns_failure_fails_closed(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()

        def failing_getaddrinfo(hostname, port):
            raise OSError("dns unavailable")

        monkeypatch.setattr(
            policy_module.socket, "getaddrinfo", failing_getaddrinfo
        )
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        with pytest.raises(PolicyViolationError, match="DNS resolution failed"):
            self._check(policy, "api.example.com")

    def test_ip_literal_connects_without_dns(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        calls = {"n": 0}

        def counting_getaddrinfo(hostname, port):
            calls["n"] += 1
            return [(2, 1, 6, "", ("203.0.113.10", 0))]

        monkeypatch.setattr(
            policy_module.socket, "getaddrinfo", counting_getaddrinfo
        )
        policy = Policy(network=NetworkPolicy(egress=("203.0.113.10",)))
        self._check(policy, "203.0.113.10")  # must not raise
        assert calls["n"] == 0  # no DNS touched for literals

    def test_out_of_policy_hostname_still_blocked(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()

        def unexpected_getaddrinfo(hostname, port):  # pragma: no cover
            raise AssertionError("resolver must not run for blocked hosts")

        monkeypatch.setattr(
            policy_module.socket, "getaddrinfo", unexpected_getaddrinfo
        )
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        with pytest.raises(PolicyViolationError, match="egress allowlist"):
            self._check(policy, "other.example.net")

    def test_wildcard_star_skips_pinning(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        calls = {"n": 0}

        def counting_getaddrinfo(hostname, port):
            calls["n"] += 1
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        monkeypatch.setattr(
            policy_module.socket, "getaddrinfo", counting_getaddrinfo
        )
        policy = Policy(network=NetworkPolicy(egress=("*",)))
        self._check(policy, "anything.example.net")  # must not raise
        assert calls["n"] == 0

    def test_ipv6_addresses_pinned(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        fake, _calls = self._fake_getaddrinfo(
            [["2606:2800:220:1:248:1893:25c8:1946"]]
        )
        monkeypatch.setattr(policy_module.socket, "getaddrinfo", fake)
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        self._check(policy, "api.example.com")  # must not raise

    def test_ttl_expiry_repins_allowed_change(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        fake, _calls = self._fake_getaddrinfo(
            [["93.184.216.34"], ["93.184.216.34"], ["93.184.216.35"]]
        )
        monkeypatch.setattr(policy_module.socket, "getaddrinfo", fake)
        # Force the pin TTL to zero: every lookup re-pins, so the changed
        # address becomes the new pinned set and stays allowed.
        monkeypatch.setattr(policy_module, "_PIN_TTL_SECONDS", 0.0)
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        self._check(policy, "api.example.com")  # must not raise

    def test_violation_names_offender_and_rule(self, monkeypatch):
        from rpaforge.core import policy as policy_module

        policy_module.reset_dns_pinning_state()
        fake, _calls = self._fake_getaddrinfo(
            [["93.184.216.34"], ["10.0.0.5"]]
        )
        monkeypatch.setattr(policy_module.socket, "getaddrinfo", fake)
        policy = Policy(network=NetworkPolicy(egress=("api.example.com",)))
        with pytest.raises(PolicyViolationError) as excinfo:
            self._check(policy, "api.example.com")
        payload = excinfo.value.to_dict()
        assert payload["kind"] == "network"
        assert payload["resource"] == "api.example.com"
        assert "egress pinning" in payload["rule"]
        assert "10.0.0.5" in payload["rule"]

