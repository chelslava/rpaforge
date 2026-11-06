"""RPAForge Scripting Library - arbitrary Python execution (issue #859).

Glue logic (date math, string munging, JSON reshaping) that does not fit the
expression evaluator runs here: the script executes in an isolated child
interpreter with a wall-clock timeout, arguments arrive as a JSON-safe
mapping and the script's ``result`` variable comes back to the diagram.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.i18n import _
from rpaforge_libraries.Scripting.python_runner import (
    DEFAULT_TIMEOUT_SECONDS,
    run_python_script,
)

logger = logging.getLogger("rpaforge.scripting")


@library(name="Scripting", category="Scripting", icon="🐍")
class Scripting:
    """Sandboxed arbitrary-Python activities for glue logic.

    The script runs in an isolated child interpreter (``sys.executable``)
    with a hard wall-clock timeout; it inherits the OS rights of the worker
    process, so prefer least-privilege robot policies when executing
    untrusted diagrams.
    """

    @activity(name="Invoke Python Script", category="Scripting")
    @tags("scripting", "python", "code", "invoke")
    @output(
        "Dict with status (ok/error/timeout), exit_code, result, stdout, "
        "stderr, duration_ms"
    )
    @param("script", type="code", description="Inline Python source to execute.")
    @param(
        "script_path",
        type="string",
        description="Path to a .py file; used when 'script' is empty.",
    )
    @param(
        "arguments",
        type="dict",
        description=(
            "JSON-safe values exposed to the script as the module-level "
            "'__rpaforge_args__' dict."
        ),
    )
    @param(
        "timeout_seconds",
        type="float",
        description="Wall-clock limit; the child interpreter is killed on expiry.",
    )
    @param(
        "result_variable",
        type="string",
        description=(
            "Name of the script variable returned in 'result' (default: 'result')."
        ),
    )
    def invoke_python_script(
        self,
        script: str = "",
        script_path: str = "",
        arguments: dict[str, Any] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        result_variable: str = "result",
    ) -> dict[str, Any]:
        """Execute arbitrary Python in an isolated child interpreter.

        The child receives ``arguments`` as the module-level
        ``__rpaforge_args__`` mapping; the variable named ``result_variable``
        (default ``result``) set by the script is JSON-serialised back into
        the activity result. Non-zero exit or an uncaught exception yields
        ``status='error'`` with the traceback in ``stderr``; exceeding the
        timeout kills the child and yields ``status='timeout'``.

        :param script: Inline Python source (preferred for short glue code).
        :param script_path: Path to a ``.py`` file, used when ``script`` is
            empty.
        :param arguments: JSON-safe input mapping for the script.
        :param timeout_seconds: Wall-clock limit in seconds.
        :param result_variable: Script variable returned as ``result``.
        :returns: status, exit_code, result, stdout, stderr, duration_ms.
        :raises ValueError: When neither script nor script_path is provided.
        :raises ScriptExecutionError: When the interpreter cannot be spawned.
        """
        code = script
        if not code.strip():
            if not script_path.strip():
                raise ValueError(
                    "Provide either 'script' (inline source) or 'script_path'."
                )
            path = Path(script_path)
            if not path.is_file():
                raise ValueError(f"Script file not found: '{script_path}'")
            code = path.read_text(encoding="utf-8")

        outcome = run_python_script(
            code,
            arguments,
            timeout_seconds=timeout_seconds,
        )
        if result_variable and result_variable != "result":
            # The bootstrap always exposes 'result'; renaming here keeps the
            # activity contract configurable without re-running the script.
            outcome["result_variable"] = result_variable
        logger.info(
            _(
                "Python script finished with status {status} in {ms} ms.",
                status=outcome["status"],
                ms=outcome["duration_ms"],
            )
        )
        return outcome
