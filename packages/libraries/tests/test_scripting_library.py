"""Tests for the Scripting library (Invoke Python Script, issue #859).

Executes real child interpreters (``sys.executable``) — no network, short
timeouts only.
"""

from __future__ import annotations

import pytest

from rpaforge_libraries.Scripting import (
    Scripting,
    run_python_script,
)
from rpaforge_libraries.Scripting.python_runner import (
    RESULT_MARKER,
    build_bootstrap,
    parse_result_line,
)


class TestInvokePythonScript:
    """End-to-end activity execution (issue #859)."""

    def test_happy_path_result_capture(self):
        lib = Scripting()
        outcome = lib.invoke_python_script(
            script="result = {'sum': 1 + 2, 'msg': 'hi'}"
        )
        assert outcome["status"] == "ok"
        assert outcome["exit_code"] == 0
        assert outcome["result"] == {"sum": 3, "msg": "hi"}
        assert outcome["duration_ms"] >= 0

    def test_arguments_injected_as_module_variable(self):
        lib = Scripting()
        outcome = lib.invoke_python_script(
            script="result = __rpaforge_args__['name'].upper()",
            arguments={"name": "rpaforge"},
        )
        assert outcome["status"] == "ok"
        assert outcome["result"] == "RPAFORGE"

    def test_script_error_reports_traceback(self):
        lib = Scripting()
        outcome = lib.invoke_python_script(script="raise RuntimeError('boom')")
        assert outcome["status"] == "error"
        assert outcome["exit_code"] == 1
        assert outcome["result"] is None
        assert "RuntimeError" in outcome["stderr"]
        assert "boom" in outcome["stderr"]

    def test_timeout_kills_child(self):
        lib = Scripting()
        outcome = lib.invoke_python_script(
            script="import time; time.sleep(30)",
            timeout_seconds=2.0,
        )
        assert outcome["status"] == "timeout"
        assert outcome["exit_code"] is None
        assert "killed" in outcome["stderr"]
        assert outcome["duration_ms"] < 30000

    def test_script_path_mode(self, tmp_path):
        script_file = tmp_path / "calc.py"
        script_file.write_text("result = 6 * 7", encoding="utf-8")
        lib = Scripting()
        outcome = lib.invoke_python_script(script_path=str(script_file))
        assert outcome["status"] == "ok"
        assert outcome["result"] == 42

    def test_missing_script_file_rejected(self):
        lib = Scripting()
        with pytest.raises(ValueError, match="not found"):
            lib.invoke_python_script(
                script_path=str(__import__("pathlib").Path("nope.py"))
            )

    def test_neither_script_nor_path_rejected(self):
        lib = Scripting()
        with pytest.raises(ValueError, match="either 'script'"):
            lib.invoke_python_script()

    def test_result_variable_passthrough_in_outcome(self):
        lib = Scripting()
        outcome = lib.invoke_python_script(
            script="result = 1", result_variable="custom_out"
        )
        assert outcome["result"] == 1
        assert outcome["result_variable"] == "custom_out"


class TestRunnerUnit:
    """Runner-level guards and protocol parsing (issue #859)."""

    def test_empty_script_rejected(self):
        with pytest.raises(ValueError, match="non-empty"):
            run_python_script("   ")

    def test_non_positive_timeout_rejected(self):
        with pytest.raises(ValueError, match="positive"):
            run_python_script("result = 1", timeout_seconds=0)

    def test_result_without_marker_is_none(self):
        assert parse_result_line("plain output\nno marker") is None

    def test_marker_last_line_wins(self):
        stdout = f"noise\n{RESULT_MARKER}not-json\nnoise\n{RESULT_MARKER}123\n"
        assert parse_result_line(stdout) == 123

    def test_invalid_marker_json_is_none(self):
        assert parse_result_line(f"{RESULT_MARKER}not-json") is None

    def test_non_jsonable_result_falls_back_to_str(self):
        outcome = run_python_script("class Weird: pass\nresult = Weird()")
        assert outcome["status"] == "ok"
        assert isinstance(outcome["result"], str)

    def test_stdout_stream_captured(self):
        outcome = run_python_script("print('hello from child')\nresult = 1")
        assert "hello from child" in outcome["stdout"]
        assert outcome["status"] == "ok"

    def test_huge_output_trimmed(self):
        outcome = run_python_script("print('x' * 50000)\nresult = 1")
        assert len(outcome["stdout"]) < 11000
        assert "truncated" in outcome["stdout"]

    def test_bootstrap_executes_hostile_code_safely(self):
        hostile = "result = '''triple\nquotes''' + str(__rpaforge_args__['k'])"
        bootstrap = build_bootstrap(hostile, {"k": ["a", "b"]})
        # The hostile source must not appear verbatim in the bootstrap.
        assert "triple" not in bootstrap
        outcome = run_python_script(hostile, {"k": ["a", "b"]})
        assert outcome["status"] == "ok"
        assert outcome["result"] == "triple\nquotes['a', 'b']"
