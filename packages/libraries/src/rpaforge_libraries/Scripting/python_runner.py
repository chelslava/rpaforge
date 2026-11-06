"""Python script execution transport (stdlib ``subprocess`` only).

Runs arbitrary user Python in an **isolated child interpreter**
(``sys.executable -c <bootstrap>``), bounded by a wall-clock timeout that
kills the child process, mirroring the executor's subprocess contract.

Result protocol: the bootstrap executes the user code in a fresh module
namespace, then prints a single ``@@RPAFORGE_RESULT@@`` marker line with the
JSON-serialised ``result`` variable (if the script set one) as the last
stdout line. User code that fails raises the child's exit code to ``1`` and
the traceback goes to stderr; a timeout kill is reported as ``timeout``.

Security note: the child inherits the OS rights of the running worker.
Robot sandbox policies (``rpaforge.core.policy``) apply to the activity
boundary in the executor; the child process itself is an ordinary Python
interpreter, so least-privilege policies and network-restricted
environments are the recommended boundary for untrusted scripts (issue
#859).
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
import time
from typing import Any

RESULT_MARKER = "@@RPAFORGE_RESULT@@"

#: ``stdout``/``stderr`` echoed in the result dict are capped at this size.
MAX_OUTPUT_ECHO = 10000

DEFAULT_TIMEOUT_SECONDS = 60.0


class ScriptExecutionError(Exception):
    """Raised when the script cannot be executed at all (bad arguments)."""


def build_bootstrap(user_code: str, arguments: dict[str, Any] | None) -> str:
    """Build the ``python -c`` bootstrap for one script execution.

    User code and arguments travel base64-encoded so arbitrary quotes,
    newlines and control characters cannot break the wrapping command.
    """
    code_b64 = base64.b64encode(user_code.encode("utf-8")).decode("ascii")
    args_json = json.dumps(dict(arguments or {}), default=str)
    args_b64 = base64.b64encode(args_json.encode("utf-8")).decode("ascii")
    marker_repr = repr(RESULT_MARKER)
    return (
        "import base64, json, sys\n"
        "__rpaforge_globals__ = {'__name__': '__main__'}\n"
        "__rpaforge_globals__['__rpaforge_args__'] = json.loads("
        f"base64.b64decode('{args_b64}').decode('utf-8'))\n"
        "try:\n"
        "    exec(compile(base64.b64decode("
        f"'{code_b64}').decode('utf-8'), "
        "'rpaforge_script', 'exec'), __rpaforge_globals__)\n"
        "except BaseException:\n"
        "    import traceback\n"
        "    traceback.print_exc()\n"
        "    sys.exit(1)\n"
        f"print({marker_repr} + json.dumps(__rpaforge_globals__.get('result'), "
        "default=str))"
    )


def parse_result_line(stdout: str) -> Any | None:
    """Extract the ``result`` value from the marker line, if present."""
    for line in reversed((stdout or "").splitlines()):
        if line.startswith(RESULT_MARKER):
            payload = line[len(RESULT_MARKER) :].strip()
            if not payload:
                return None
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                return None
    return None


def _trim_output(text: str) -> str:
    """Cap echoed output streams to keep the result JSON-safe."""
    if len(text) > MAX_OUTPUT_ECHO:
        return text[:MAX_OUTPUT_ECHO] + f"\n... (truncated at {MAX_OUTPUT_ECHO} chars)"
    return text


def run_python_script(
    user_code: str,
    arguments: dict[str, Any] | None = None,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Execute ``user_code`` in an isolated child interpreter.

    :param user_code: Python source to execute.
    :param arguments: JSON-safe mapping exposed to the script as the
        module-level ``__rpaforge_args__`` variable.
    :param timeout_seconds: Wall-clock limit; the child is killed on expiry.
    :returns: Dict with status (ok/error/timeout), exit_code, result,
        stdout, stderr, duration_ms.
    :raises ScriptExecutionError: When the interpreter cannot be spawned.
    """
    if not user_code or not user_code.strip():
        raise ValueError("Script must be a non-empty string.")
    timeout = float(timeout_seconds)
    if timeout <= 0:
        raise ValueError("timeout_seconds must be positive.")

    bootstrap = build_bootstrap(user_code, arguments)
    started = time.monotonic()
    try:
        completed = subprocess.run(
            [sys.executable, "-c", bootstrap],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        duration_ms = int((time.monotonic() - started) * 1000)
        return {
            "status": "timeout",
            "exit_code": None,
            "result": None,
            "stdout": "",
            "stderr": f"Script exceeded {timeout}s and was killed",
            "duration_ms": duration_ms,
        }
    except OSError as exc:
        raise ScriptExecutionError(
            f"Failed to spawn the Python interpreter: {exc.__class__.__name__}"
        ) from exc

    duration_ms = int((time.monotonic() - started) * 1000)
    status = "ok" if completed.returncode == 0 else "error"
    return {
        "status": status,
        "exit_code": completed.returncode,
        "result": parse_result_line(completed.stdout) if status == "ok" else None,
        "stdout": _trim_output(completed.stdout or ""),
        "stderr": _trim_output(completed.stderr or ""),
        "duration_ms": duration_ms,
    }
