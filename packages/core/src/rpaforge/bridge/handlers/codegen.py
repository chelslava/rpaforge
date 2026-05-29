"""Code generation handlers: generate, format, validate."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import TYPE_CHECKING, Any

from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.bridge")
_RUFF_EXECUTABLE: str | None = shutil.which("ruff")


def setup_codegen_handlers(cls: type) -> None:
    """Add code generation methods to BridgeHandlers class."""

    def _handle_get_activities(self, _params: dict) -> dict[str, Any]:
        import datetime
        from decimal import Decimal
        from enum import Enum

        from rpaforge.core.activity import list_activities

        def _serialize_value(val: Any) -> Any:
            """Convert value to JSON-serializable type."""
            if val is None:
                return None
            if isinstance(val, (bool, int, float, str)):
                return val
            if isinstance(val, (list, tuple)):
                return [_serialize_value(v) for v in val]
            if isinstance(val, dict):
                return {k: _serialize_value(v) for k, v in val.items()}
            if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
                return val.isoformat()
            if isinstance(val, datetime.timedelta):
                return val.total_seconds()
            if isinstance(val, Decimal):
                return float(val)
            if isinstance(val, Enum):
                return val.value
            return str(val)

        activities = [
            {
                "id": f"{act.library}.{act.id}" if act.library else act.id,
                "name": act.name,
                "library": act.library,
                "category": act.category,
                "description": act.description,
                "tags": list(act.tags) if act.tags else [],
                "type": (
                    act.activity_type.value if hasattr(act, "activity_type") else "sync"
                ),
                "timeout_ms": act.timeout_ms,
                "has_retry": act.has_retry,
                "has_continue_on_error": act.has_continue_on_error,
                "params": [
                    {k: _serialize_value(v) for k, v in p.items()}
                    if isinstance(p, dict) else p
                    for p in (act.params or [])
                ],
                "has_output": act.has_output,
                "output_description": act.output_description,
            }
            for act in list_activities()
        ]

        return {"activities": activities}

    def _handle_format_code(self, params: dict) -> dict[str, Any]:
        code = params.get("code", "")

        if not code:
            return {"formatted_code": "", "changed": False}

        from rpaforge.core.validation import ValidationError as ValidationErr
        from rpaforge.core.validation import validate_expression

        try:
            validate_expression(code, limit=51200)
        except ValidationErr as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message=str(e),
            ) from None

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
            ) as f:
                f.write(code)
                temp_path = f.name

            if _RUFF_EXECUTABLE is None:
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INTERNAL_ERROR,
                    message="ruff is not installed or not found in PATH",
                )

            result = subprocess.run(
                [_RUFF_EXECUTABLE, "format", temp_path],
                capture_output=True,
                text=True,
                timeout=10,
            )

            with open(temp_path) as f:
                formatted_code = f.read()

            if result.returncode != 0 and "error" in result.stderr.lower():
                logger.warning(f"Ruff format warning: {result.stderr}")

            changed = formatted_code != code

            return {
                "formatted_code": formatted_code,
                "changed": changed,
            }
        except subprocess.TimeoutExpired:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Code formatting timed out",
            ) from None
        except FileNotFoundError:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Ruff formatter not found. Install with: pip install ruff",
            ) from None
        except Exception as e:
            logger.error(f"Format error: {e}")
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"Format error: {str(e)}",
            ) from None
        finally:
            if temp_path is not None:
                with contextlib.suppress(OSError):
                    os.unlink(temp_path)

    def _handle_validate_code(self, params: dict) -> dict[str, Any]:
        code = params.get("code", "")

        if not code:
            return {"errors": [], "warnings": []}

        from rpaforge.core.validation import ValidationError as ValidationErr
        from rpaforge.core.validation import validate_expression

        try:
            validate_expression(code, limit=51200)
        except ValidationErr as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message=str(e),
            ) from None

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
            ) as f:
                f.write(code)
                temp_path = f.name

            if _RUFF_EXECUTABLE is None:
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INTERNAL_ERROR,
                    message="ruff is not installed or not found in PATH",
                )

            result = subprocess.run(
                [_RUFF_EXECUTABLE, "check", temp_path, "--output-format=json"],
                capture_output=True,
                text=True,
                timeout=10,
            )

            errors = []
            warnings = []

            if result.stdout.strip():
                try:
                    diagnostics = json.loads(result.stdout)
                    for diag in diagnostics:
                        location = diag.get("location", {})
                        end_location = diag.get("end_location", {})
                        severity = diag.get("severity", "error")
                        code_info = diag.get("code", {})
                        message = diag.get("message", "")

                        if isinstance(code_info, dict):
                            code_str = f"{code_info.get('prefix', '')}{code_info.get('value', '')}"
                        elif isinstance(code_info, str):
                            code_str = code_info
                        else:
                            code_str = ""

                        error_entry = {
                            "line": location.get("line", 1),
                            "column": location.get("column", 0),
                            "endLine": end_location.get(
                                "line", location.get("line", 1)
                            ),
                            "endColumn": end_location.get("column", 0),
                            "message": message,
                            "code": code_str,
                            "severity": severity.lower(),
                        }

                        if severity.lower() == "error":
                            errors.append(error_entry)
                        else:
                            warnings.append(error_entry)
                except json.JSONDecodeError:
                    logger.warning(
                        f"Failed to parse ruff check output: {result.stdout}"
                    )

            return {"errors": errors, "warnings": warnings}
        except subprocess.TimeoutExpired:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Code validation timed out",
            ) from None
        except FileNotFoundError:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Ruff not found. Install with: pip install ruff",
            ) from None
        except Exception as e:
            logger.error(f"Validation error: {e}")
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"Validation error: {str(e)}",
            ) from None
        finally:
            if temp_path is not None:
                with contextlib.suppress(OSError):
                    os.unlink(temp_path)

    async def _handle_generate_code(self, params: dict) -> dict[str, Any]:
        try:
            return await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, self._do_generate_code, params
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError as err:
            raise JSONRPCError(
                JSONRPCErrorCode.INTERNAL_ERROR, "generateCode timed out after 30s"
            ) from err

    def _do_generate_code(self, params: dict) -> dict[str, Any]:
        from rpaforge.codegen.python_generator import PythonCodeGenerator

        diagram = params.get("diagram", {})
        sub_diagrams = params.get("subDiagrams", {})

        generator = PythonCodeGenerator()

        if sub_diagrams:
            files = generator.generate_project(diagram, sub_diagrams)
            main_code = files.get("main.py", "")
            _, sourcemap = generator.generate_with_sourcemap(diagram)
            return {
                "code": main_code,
                "files": files,
                "sourcemap": sourcemap,
                "language": "python",
            }

        code, sourcemap = generator.generate_with_sourcemap(diagram)

        return {
            "code": code,
            "sourcemap": sourcemap,
            "language": "python",
        }

    cls._handle_get_activities = _handle_get_activities
    cls._handle_format_code = _handle_format_code
    cls._handle_validate_code = _handle_validate_code
    cls._handle_generate_code = _handle_generate_code
    cls._do_generate_code = _do_generate_code
