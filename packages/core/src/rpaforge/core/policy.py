"""Declarative robot permission policies (issue #844).

A policy manifest restricts what a process MAY touch: filesystem paths,
network egress, subprocess spawns, and the environment variables passed to
spawned processes. Enforcement is layered:

- The engine process wraps every activity dispatch in an activation window.
  A Python audit hook (``sys.addaudithook``), installed lazily at first use,
  checks ``open`` / ``socket.connect`` / ``subprocess.Popen`` / ... events
  against the active policy and raises :class:`PolicyViolationError` on the
  first out-of-policy access. With no policy active the hook is a cheap
  pass-through, so default behavior is unchanged.
- Subprocess workers (:class:`~rpaforge.core._worker_pool.WorkerPoolExecutor`)
  receive the policy through their executor state and enforce it inside the
  worker process — the hard boundary for timeout-isolated activity calls.

Resolution order: explicit flag/argument > ``RPAFORGE_POLICY`` environment
variable > none (current behavior; the runner logs a warning).

Manifest example (JSON)::

    {
      "filesystem": {
        "read": ["C:/data/in/**"],
        "write": ["C:/data/out/**/*.xlsx"],
        "deny_by_default": true
      },
      "network": {
        "egress": ["api.example.com", "*.internal.corp"],
        "deny_by_default": true
      },
      "process": {
        "allow": ["python.exe", "notepad.exe"],
        "deny": ["powershell.exe"]
      },
      "environment": {
        "allow": ["PATH", "TEMP", "SYSTEMROOT"]
      }
    }

An absent section means that boundary is not restricted. When a section is
present, ``deny_by_default`` defaults to ``true`` (fail-closed): accesses
not matching the allowlist are violations. Setting ``deny_by_default`` to
``false`` keeps the allowlist advisory (violations are allowed but still
visible as audit events) — useful for an observe-first rollout.

Path patterns are globs: ``*`` matches within one path segment, ``**``
crosses segments (``C:/data/**`` covers the whole tree). Matching is
case-insensitive on Windows. Network entries match the connect host exactly
or as a subdomain suffix (``example.com`` also allows ``api.example.com``);
``*`` allows every host.
"""

from __future__ import annotations

import contextvars
import json
import os
import re
import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

__all__ = [
    "EnvironmentPolicy",
    "FilesystemPolicy",
    "NetworkPolicy",
    "Policy",
    "PolicyConfigError",
    "PolicyViolationError",
    "activated_policy",
    "install_audit_hook",
    "load_policy_file",
]


class PolicyConfigError(ValueError):
    """Raised when a policy manifest cannot be parsed or fails validation."""


class PolicyViolationError(Exception):
    """Raised when an activity accesses a resource denied by the active policy.

    Carries structured fields so audit events can surface typed details:
    ``kind`` (``filesystem`` / ``network`` / ``process`` / ``environment``),
    ``resource`` (path, host:port, executable or env var name) and ``rule``
    (the specific allowlist that rejected the access).
    """

    def __init__(self, kind: str, resource: str, rule: str):
        # Keep (kind, resource, rule) as Exception.args so the error survives
        # pickling across the subprocess boundary; __str__ renders the message.
        super().__init__(kind, resource, rule)
        self.kind = kind
        self.resource = resource
        self.rule = rule

    def __str__(self) -> str:
        return (
            f"Policy violation [{self.kind}]: {self.resource!r} is not allowed "
            f"(rule: {self.rule})"
        )

    def to_dict(self) -> dict[str, str]:
        return {
            "error": "PolicyViolationError",
            "kind": self.kind,
            "resource": self.resource,
            "rule": self.rule,
        }


# ---------------------------------------------------------------------------
# Manifest schema
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FilesystemPolicy:
    """Filesystem access allowlists (glob patterns, absolute paths)."""

    read: tuple[str, ...] = ()
    write: tuple[str, ...] = ()
    deny_by_default: bool = True


@dataclass(frozen=True)
class NetworkPolicy:
    """Network egress allowlist (hostnames or IPs; ``*`` allows all)."""

    egress: tuple[str, ...] = ()
    deny_by_default: bool = True


@dataclass(frozen=True)
class ProcessPolicy:
    """Subprocess spawn control: deny-list always wins over allow-list."""

    allow: tuple[str, ...] = ()
    deny: tuple[str, ...] = ()
    deny_by_default: bool = True


@dataclass(frozen=True)
class EnvironmentPolicy:
    """Environment variable allowlist for spawned subprocesses."""

    allow: tuple[str, ...] = ()


@dataclass(frozen=True)
class Policy:
    """A resolved robot permission policy (picklable, immutable)."""

    filesystem: FilesystemPolicy | None = None
    network: NetworkPolicy | None = None
    process: ProcessPolicy | None = None
    environment: EnvironmentPolicy | None = None
    source_path: str | None = None

    @property
    def is_empty(self) -> bool:
        return (
            self.filesystem is None
            and self.network is None
            and self.process is None
            and self.environment is None
        )

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if self.filesystem is not None:
            data["filesystem"] = {
                "read": list(self.filesystem.read),
                "write": list(self.filesystem.write),
                "deny_by_default": self.filesystem.deny_by_default,
            }
        if self.network is not None:
            data["network"] = {
                "egress": list(self.network.egress),
                "deny_by_default": self.network.deny_by_default,
            }
        if self.process is not None:
            data["process"] = {
                "allow": list(self.process.allow),
                "deny": list(self.process.deny),
                "deny_by_default": self.process.deny_by_default,
            }
        if self.environment is not None:
            data["environment"] = {"allow": list(self.environment.allow)}
        if self.source_path:
            data["source_path"] = self.source_path
        return data

    @classmethod
    def from_dict(cls, data: Any, source_path: str | None = None) -> Policy:
        """Parse and validate a policy manifest (dict from JSON/YAML)."""
        if not isinstance(data, dict):
            raise PolicyConfigError("policy manifest must be a JSON object")
        unknown = set(data) - {
            "filesystem",
            "network",
            "process",
            "environment",
            "source_path",
        }
        if unknown:
            raise PolicyConfigError(
                f"unknown policy sections: {sorted(unknown)}; expected "
                "filesystem/network/process/environment"
            )

        filesystem = _parse_filesystem(data.get("filesystem"))
        network = _parse_network(data.get("network"))
        process = _parse_process(data.get("process"))
        environment = _parse_environment(data.get("environment"))

        if (
            filesystem is None
            and network is None
            and process is None
            and environment is None
        ):
            raise PolicyConfigError(
                "policy manifest defines no sections; remove the file or add "
                "at least one of filesystem/network/process/environment"
            )

        if source_path is None and isinstance(data.get("source_path"), str):
            source_path = data["source_path"]

        return cls(
            filesystem=filesystem,
            network=network,
            process=process,
            environment=environment,
            source_path=source_path,
        )


def _parse_string_list(value: Any, section: str, key: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
        raise PolicyConfigError(f"policy '{section}.{key}' must be a list of strings")
    return tuple(value)


def _parse_bool(value: Any, section: str, key: str, default: bool) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise PolicyConfigError(f"policy '{section}.{key}' must be a boolean")
    return value


def _parse_filesystem(value: Any) -> FilesystemPolicy | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise PolicyConfigError("policy 'filesystem' section must be an object")
    return FilesystemPolicy(
        read=_parse_string_list(value.get("read"), "filesystem", "read"),
        write=_parse_string_list(value.get("write"), "filesystem", "write"),
        deny_by_default=_parse_bool(
            value.get("deny_by_default"), "filesystem", "deny_by_default", True
        ),
    )


def _parse_network(value: Any) -> NetworkPolicy | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise PolicyConfigError("policy 'network' section must be an object")
    return NetworkPolicy(
        egress=_parse_string_list(value.get("egress"), "network", "egress"),
        deny_by_default=_parse_bool(
            value.get("deny_by_default"), "network", "deny_by_default", True
        ),
    )


def _parse_process(value: Any) -> ProcessPolicy | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise PolicyConfigError("policy 'process' section must be an object")
    return ProcessPolicy(
        allow=_parse_string_list(value.get("allow"), "process", "allow"),
        deny=_parse_string_list(value.get("deny"), "process", "deny"),
        deny_by_default=_parse_bool(
            value.get("deny_by_default"), "process", "deny_by_default", True
        ),
    )


def _parse_environment(value: Any) -> EnvironmentPolicy | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise PolicyConfigError("policy 'environment' section must be an object")
    return EnvironmentPolicy(
        allow=_parse_string_list(value.get("allow"), "environment", "allow")
    )


def load_policy_file(path: str | Path) -> Policy:
    """Load a policy manifest from a JSON (or YAML, if PyYAML is installed) file."""
    policy_path = Path(path).expanduser()
    try:
        raw = policy_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PolicyConfigError(
            f"cannot read policy file {policy_path}: {exc}"
        ) from exc

    data: Any
    if policy_path.suffix.lower() in (".yaml", ".yml"):
        try:
            import yaml  # type: ignore[import-untyped]
        except ImportError as exc:
            raise PolicyConfigError(
                f"YAML policy {policy_path} requires PyYAML (not installed); "
                "use JSON or install pyyaml"
            ) from exc
        try:
            data = yaml.safe_load(raw)
        except Exception as exc:
            raise PolicyConfigError(
                f"invalid YAML in policy file {policy_path}: {exc}"
            ) from exc
    else:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise PolicyConfigError(
                f"invalid JSON in policy file {policy_path}: {exc}"
            ) from exc

    return Policy.from_dict(data, source_path=str(policy_path))


# ---------------------------------------------------------------------------
# Glob matching (filesystem)
# ---------------------------------------------------------------------------


def _normalize_path(value: str) -> str:
    """Normalize a path or pattern for matching (forward slashes; ci on Windows)."""
    normalized = os.path.abspath(os.path.expandvars(os.path.expanduser(value)))
    normalized = normalized.replace("\\", "/")
    if os.name == "nt":
        normalized = normalized.lower()
    return normalized


@lru_cache(maxsize=512)
def _glob_regex(pattern: str) -> re.Pattern[str]:
    """Compile a glob pattern where ``**`` crosses path segments, ``*`` does not."""
    parts: list[str] = []
    i = 0
    while i < len(pattern):
        char = pattern[i]
        if char == "*":
            if pattern[i : i + 3] == "**/":
                parts.append("(?:[^/]+/)*")
                i += 3
            elif pattern[i : i + 2] == "**":
                parts.append(".*")
                i += 2
            else:
                parts.append("[^/]*")
                i += 1
        elif char == "?":
            parts.append("[^/]")
            i += 1
        else:
            parts.append(re.escape(char))
            i += 1
    return re.compile("".join(parts) + r"\Z")


def _path_matches(pattern: str, path: str) -> bool:
    return _glob_regex(pattern).fullmatch(path) is not None


def _check_filesystem(policy: FilesystemPolicy, raw_path: Any, write: bool) -> None:
    path_str = (
        str(raw_path)
        if not isinstance(raw_path, (str, bytes, os.PathLike))
        else os.fsdecode(raw_path)
    )
    normalized = _normalize_path(path_str)
    rules = policy.write if write else policy.read
    rule_name = "write allowlist" if write else "read allowlist"
    for pattern in rules:
        if _path_matches(_normalize_path(pattern), normalized):
            return
    if not policy.deny_by_default:
        return
    raise PolicyViolationError("filesystem", path_str, rule_name)


# ---------------------------------------------------------------------------
# Network / process / environment checks
# ---------------------------------------------------------------------------


def _host_matches(entry: str, host: str) -> bool:
    entry = entry.strip().lower()
    host = str(host).strip().lower().rstrip(".")
    if not entry or entry == "*":
        return True
    if entry.startswith("*."):
        return host.endswith(entry[1:])
    return host == entry or host.endswith("." + entry)


def _check_network(policy: NetworkPolicy, address: Any) -> None:
    if not isinstance(address, tuple) or not address:
        return  # AF_UNIX and exotic families are out of scope
    host = address[0]
    if not isinstance(host, str):
        return
    for entry in policy.egress:
        if _host_matches(entry, host):
            return
    if not policy.deny_by_default:
        return
    raise PolicyViolationError("network", f"{host}", "egress allowlist")


def _first_command_token(command_line: str) -> str:
    """Extract the executable token from a command line (handles quoting)."""
    command_line = command_line.strip()
    if command_line.startswith('"'):
        end = command_line.find('"', 1)
        return command_line[1:end] if end != -1 else command_line[1:]
    return command_line.split(" ", 1)[0]


def _executable_name(executable: Any, args: Any) -> str:
    """Resolve the executable basename from Popen/exec/spawn audit arguments.

    POSIX passes ``(path, [args...])``; Windows may pass ``executable=None``
    with the whole command line as a string.
    """
    candidate = ""
    if isinstance(executable, (str, bytes)) and executable:
        candidate = os.fsdecode(executable)
    elif isinstance(args, (list, tuple)) and args and isinstance(args[0], (str, bytes)):
        candidate = os.fsdecode(args[0])
    elif isinstance(args, (str, bytes)) and args:
        candidate = _first_command_token(os.fsdecode(args))
    if not candidate:
        return ""
    if " " in candidate and not os.path.exists(candidate):
        candidate = _first_command_token(candidate)
    return os.path.basename(candidate) or candidate


def _check_process(policy: ProcessPolicy, name: str) -> None:
    if not name:
        if policy.deny_by_default and not policy.allow:
            raise PolicyViolationError(
                "process", "<unresolved executable>", "spawn allowlist"
            )
        return
    lowered = name.lower()
    for entry in policy.deny:
        if entry.lower() == lowered:
            raise PolicyViolationError("process", name, "deny-list")
    for entry in policy.allow:
        if entry.lower() == lowered:
            return
    if not policy.deny_by_default:
        return
    raise PolicyViolationError("process", name, "spawn allowlist")


def _check_environment(policy: EnvironmentPolicy, env: Any) -> None:
    effective = env if isinstance(env, dict) else dict(os.environ)
    allowed = {name.lower() for name in policy.allow}
    offending = sorted(key for key in effective if key.lower() not in allowed)
    if offending:
        raise PolicyViolationError(
            "environment",
            ",".join(offending[:8]) + ("..." if len(offending) > 8 else ""),
            "environment allowlist",
        )


# ---------------------------------------------------------------------------
# Audit-hook runtime
# ---------------------------------------------------------------------------

_ACTIVE_POLICY: contextvars.ContextVar[Policy | None] = contextvars.ContextVar(
    "rpaforge_active_policy", default=None
)

_HOOK_LOCK = threading.Lock()
_HOOK_INSTALLED = False

# Audit events that mutate the filesystem — first argument is the affected path.
_FS_WRITE_EVENTS = (
    "os.remove",
    "os.rmdir",
    "os.mkdir",
    "os.truncate",
    "os.chmod",
    "os.chown",
)

# Audit events that write BOTH a source and a destination path argument.
_FS_WRITE_TWO_PATHS_EVENTS = ("os.rename", "os.replace", "os.link", "os.symlink")


def _handle_open(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.filesystem is None or not args:
        return
    path, mode, flags = (args + (None, None))[:3]
    write = _mode_is_write(mode, flags)
    _check_filesystem(policy.filesystem, path, write=write)


def _mode_is_write(mode: Any, flags: Any) -> bool:
    if isinstance(mode, str):
        return bool({"w", "a", "x", "+"} & set(mode))
    if isinstance(flags, int) and flags:
        write_flags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC
        return bool(flags & write_flags)
    return False


def _handle_fs_write(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.filesystem is None or not args:
        return
    _check_filesystem(policy.filesystem, args[0], write=True)


def _handle_fs_write_two_paths(policy: Policy, args: tuple[Any, ...]) -> None:
    """Check both path arguments (os.rename/os.link style: src and dst)."""
    if policy.filesystem is None:
        return
    _check_filesystem(policy.filesystem, args[0], write=True)
    if len(args) >= 2:
        _check_filesystem(policy.filesystem, args[1], write=True)


def _handle_copyfile(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.filesystem is None or len(args) < 2:
        return
    _check_filesystem(policy.filesystem, args[0], write=False)
    _check_filesystem(policy.filesystem, args[1], write=True)


def _handle_listdir(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.filesystem is None or not args:
        return
    _check_filesystem(policy.filesystem, args[0], write=False)


def _handle_socket_connect(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.network is None or len(args) < 2:
        return
    _check_network(policy.network, args[1])


def _handle_popen(policy: Policy, args: tuple[Any, ...]) -> None:
    executable, popen_args, _cwd, env = (args + (None, None, None, None))[:4]
    if policy.process is not None:
        _check_process(policy.process, _executable_name(executable, popen_args))
    if policy.environment is not None:
        _check_environment(policy.environment, env)


def _handle_os_system(policy: Policy, args: tuple[Any, ...]) -> None:
    if policy.process is None or not args:
        return
    command = args[0] if isinstance(args[0], str) else ""
    _check_process(policy.process, _executable_name(None, command))


def _handle_os_exec(policy: Policy, args: tuple[Any, ...]) -> None:
    path, exec_args, env = (args + (None, None, None))[:3]
    if policy.process is not None:
        _check_process(policy.process, _executable_name(path, exec_args))
    if policy.environment is not None:
        _check_environment(policy.environment, env)


_AUDIT_HANDLERS = {
    "open": _handle_open,
    "shutil.copyfile": _handle_copyfile,
    "os.listdir": _handle_listdir,
    "socket.connect": _handle_socket_connect,
    "subprocess.Popen": _handle_popen,
    "os.system": _handle_os_system,
    "os.exec": _handle_os_exec,
    "os.spawn": _handle_os_exec,
}
for _event_name in _FS_WRITE_EVENTS:
    _AUDIT_HANDLERS[_event_name] = _handle_fs_write
for _event_name in _FS_WRITE_TWO_PATHS_EVENTS:
    _AUDIT_HANDLERS[_event_name] = _handle_fs_write_two_paths


def _audit_hook(event: str, args: tuple[Any, ...]) -> None:
    policy = _ACTIVE_POLICY.get()
    if policy is None:
        return
    handler = _AUDIT_HANDLERS.get(event)
    if handler is not None:
        handler(policy, args)


def install_audit_hook() -> None:
    """Install the process-wide pass-through policy audit hook (idempotent).

    The hook enforces only while a policy is activated (inside activity
    dispatch); with no active policy it returns immediately, so installing it
    never changes default behavior. Audit hooks cannot be removed — this is
    by design in CPython and the hook is intentionally cheap.
    """
    global _HOOK_INSTALLED
    with _HOOK_LOCK:
        if _HOOK_INSTALLED:
            return
        sys.addaudithook(_audit_hook)
        _HOOK_INSTALLED = True


@contextmanager
def activated_policy(policy: Policy | None) -> Iterator[None]:
    """Activate ``policy`` for the current thread context (no-op when ``None``).

    Enforcement applies to the current context only: threads spawned during
    the window inherit it only if the caller propagates ``contextvars`` (the
    engine's timeout handler does); subprocess workers enforce their own copy
    received through executor state.
    """
    if policy is None:
        yield
        return
    install_audit_hook()
    token = _ACTIVE_POLICY.set(policy)
    try:
        yield
    finally:
        _ACTIVE_POLICY.reset(token)
