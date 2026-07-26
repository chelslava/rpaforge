"""
Sandboxed execution for third-party RPA libraries.

This module provides AST-based import validation and blocking of dangerous
imports in third-party library code to prevent arbitrary code execution.
"""

from __future__ import annotations

import ast
import importlib.machinery
import logging
import sys
from pathlib import Path
from typing import Any

from rpaforge.i18n import _ as _t

logger = logging.getLogger(__name__)

ALLOWED_IMPORTS = frozenset(
    {
        "math",
        "json",
        "datetime",
        "re",
        "typing",
        "collections",
        "functools",
        "itertools",
        "random",
        "statistics",
        "string",
        "operator",
        "copy",
        "hashlib",
        "time",
        "warnings",
        "decimal",
        "fractions",
        "uuid",
        "unicodedata",
        "struct",
        "codecs",
        "io",
        "types",
        "dis",
        "pickle",
        "ast",
        "pprint",
        "reprlib",
        "enum",
        "graphlib",
        "heapq",
        "bisect",
        "array",
        "queue",
        "contextlib",
        "dataclasses",
        "inspect",
        "traceback",
        "linecache",
        "tokenize",
        "keyword",
        "formatter",
        "textwrap",
        "difflib",
        "csv",
        "html",
        "xml",
        "pathlib",
        "filecmp",
        "tempfile",
        "glob",
        "fnmatch",
        "shutil",
        "gzip",
        "zipfile",
        "tarfile",
        "configparser",
        "netrc",
        "xdrlib",
        "plistlib",
        "crypt",
        "spwd",
        "grp",
        "pwd",
        "site",
        "errno",
        "ctypes",
        "select",
        "selectors",
        "signal",
        "mmap",
        "fcntl",
        "pty",
        "tty",
        "termios",
        "resource",
        "sys",
        "os",
        "cProfile",
        "profile",
        "timeit",
        "trace",
        "memoryview",
        "version",
        "builtins",
    }
)

BLOCKED_IMPORTS = frozenset(
    {
        "os",
        "subprocess",
        "sys",
        "socket",
        "http",
        "urllib",
        "ftplib",
        "poplib",
        "imaplib",
        "smtplib",
        "telnetlib",
        "xmlrpc",
        "cgi",
        "cgitb",
        "asyncio",
        "threading",
        "multiprocessing",
        "concurrent",
        "queue",
        "sched",
        "parser",
        "symbol",
        "symtable",
        "keyword",
        "tokenize",
        "tabnanny",
        "pyclbr",
        "py_compile",
        "compileall",
        "pickletools",
        "importlib",
        "pkgutil",
        "modulefinder",
        "runpy",
        "importlib_metadata",
        "compiler",
        "code",
        "codeop",
        "readline",
        "rlcompleter",
        "pdb",
        "io",
        "StringIO",
        "BytesIO",
        "tempfile",
        "shutil",
        "gzip",
        "zipfile",
        "tarfile",
        "configparser",
        "netrc",
        "xdrlib",
        "plistlib",
        "crypt",
        "spwd",
        "grp",
        "pwd",
        "site",
        "errno",
        "ctypes",
        "select",
        "selectors",
        "signal",
        "mmap",
        "fcntl",
        "pty",
        "tty",
        "termios",
        "memoryview",
        "builtins",
    }
)

BLOCKED_BUILTINS = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "open",
        "file",
        "input",
        "raw_input",
        "__import__",
    }
)


class SandboxViolationError(Exception):
    """Raised when sandbox validation fails due to dangerous import or operation."""

    def __init__(self, message: str, details: str | None = None):
        super().__init__(message)
        self.message = message
        self.details = details

    def __str__(self) -> str:
        if self.details:
            return f"{self.message}: {self.details}"
        return self.message

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": "SandboxViolationError",
            "message": self.message,
            "details": self.details,
        }


def resolve_module_source(module_name: str) -> Path:
    """Resolve a Python module to source without importing it."""
    search_path: list[str] | None = list(sys.path)
    spec: importlib.machinery.ModuleSpec | None = None
    parts = module_name.split(".")
    for index, part in enumerate(parts):
        spec = importlib.machinery.PathFinder.find_spec(part, search_path)
        if spec is None:
            raise SandboxViolationError(
                _t("sandbox.library_module_not_found"), details=module_name
            )
        if index < len(parts) - 1:
            locations = spec.submodule_search_locations
            if not locations or spec.loader is None:
                raise SandboxViolationError(
                    _t("sandbox.library_has_no_source_file"), details=module_name
                )
            search_path = list(locations)

    origin = spec.origin if spec else None
    if not origin or origin in {"built-in", "frozen"}:
        raise SandboxViolationError(
            _t("sandbox.library_has_no_source_file"), details=module_name
        )
    source_path = Path(origin)
    if source_path.suffix.lower() != ".py":
        raise SandboxViolationError(
            _t("sandbox.library_has_no_source_file"), details=module_name
        )
    return source_path


def count_activity_decorators(module_path: Path) -> int:
    """Count ``@activity`` methods in a module without importing it."""
    try:
        tree = ast.parse(module_path.read_text(encoding="utf-8"), str(module_path))
    except (OSError, UnicodeDecodeError, SyntaxError) as exc:
        raise SandboxViolationError(
            _t("sandbox.failed_to_read_module_file"), details=f"{module_path}: {exc}"
        ) from exc

    count = 0
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if (
                isinstance(decorator, ast.Name)
                and decorator.id == "activity"
                or isinstance(decorator, ast.Attribute)
                and decorator.attr == "activity"
            ):
                count += 1
            elif isinstance(decorator, ast.Call):
                target = decorator.func
                if (isinstance(target, ast.Name) and target.id == "activity") or (
                    isinstance(target, ast.Attribute) and target.attr == "activity"
                ):
                    count += 1
    return count


def validate_module_package(module_name: str) -> Path:
    """Validate every Python file in a plugin package before importing it."""
    source_path = resolve_module_source(module_name)
    parts = module_name.split(".")
    package_root = source_path.parents[max(len(parts) - 2, 0)]
    checker = ImportWhitelistChecker()
    for candidate in package_root.rglob("*.py"):
        checker.check_module(str(candidate))
    return source_path


class ImportWhitelistChecker(ast.NodeVisitor):
    """
    AST visitor that checks for unsafe imports in Python source code.

    This class walks the AST tree and blocks:
    - Dangerous stdlib imports (e.g., os, subprocess, sys, socket)
    - Star imports (from X import *)
    - __import__ calls
    - exec(), eval(), compile() calls
    - Direct getattr on objects to access dunder methods
    """

    def __init__(self) -> None:
        self._in_from_import = False
        self._errors: list[str] = []
        self._import_targets: list[str] = []

    def check_source(self, source_code: str) -> None:
        """Parse and check source code for unsafe imports."""
        try:
            tree = ast.parse(source_code, filename="<sandboxed>")
        except SyntaxError as e:
            raise SandboxViolationError(
                _t("sandbox.syntax_error_in_sandboxed_code", msg=str(e)),
                details=f"Line {e.lineno}: {e.text}",
            ) from e

        self._errors = []
        self._import_targets = []
        self.visit(tree)

        if self._errors:
            raise SandboxViolationError(
                _t("sandbox.unsafe_import_detected"),
                details="; ".join(self._errors),
            )

    def check_module(self, module_path: str) -> None:
        """Read module file and check for unsafe imports."""
        try:
            with open(module_path, encoding="utf-8") as f:
                source = f.read()
        except (OSError, UnicodeDecodeError) as e:
            raise SandboxViolationError(
                _t("sandbox.failed_to_read_module_file"),
                details=f"{module_path}: {e}",
            ) from e

        self.check_source(source)

    def visit_Import(self, node: ast.Import) -> None:
        """Process 'import X' statements."""
        for alias in node.names:
            module_name = alias.name
            self._import_targets.append(module_name)

            parts = module_name.split(".")
            for i in range(len(parts)):
                partial = ".".join(parts[: i + 1])
                if partial in BLOCKED_IMPORTS:
                    self._errors.append(_t("sandbox.blocked_import", module=partial))
                    break

        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        """Process 'from X import Y' statements."""
        module_name = node.module or ""

        self._import_targets.append(module_name)

        if module_name in BLOCKED_IMPORTS:
            self._errors.append(_t("sandbox.blocked_import_from", module=module_name))
        elif module_name:
            parts = module_name.split(".")
            for i in range(len(parts)):
                partial = ".".join(parts[: i + 1])
                if partial in BLOCKED_IMPORTS:
                    self._errors.append(
                        _t("sandbox.blocked_import_from", module=partial)
                    )
                    break

        if any(alias.name == "*" for alias in node.names):
            self._errors.append(_t("sandbox.star_import_detected", module=module_name))

        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        """Process function calls."""
        if isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_BUILTINS:
                self._errors.append(
                    _t("sandbox.blocked_builtin_call", builtin=node.func.id)
                )
            if node.func.id == "__import__":
                self._errors.append(_t("sandbox.blocked_import_call"))

        if (
            isinstance(node.func, ast.Name)
            and node.func.id == "getattr"
            and len(node.args) >= 2
        ):
            second_arg = node.args[1]
            if isinstance(second_arg, ast.Constant) and isinstance(
                second_arg.value, str
            ):
                attr_name = second_arg.value
                if attr_name.startswith("__") and attr_name.endswith("__"):
                    self._errors.append(
                        _t("sandbox.blocked_dunder_getattr", attr=attr_name)
                    )

        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        """Process attribute access (obj.attr)."""
        self.generic_visit(node)

    def visit_Exec(self, node: Any) -> None:  # noqa: ARG002
        """Process exec() statements (Python 2 style)."""
        self._errors.append(_t("sandbox.blocked_exec"))

    def visit_Raise(self, node: ast.Raise) -> None:
        """Process raise statements."""
        self.generic_visit(node)


def check_source_imports(source_code: str) -> None:
    """Validate Python source code for unsafe imports."""
    checker = ImportWhitelistChecker()
    checker.check_source(source_code)


def check_module_imports(module_path: str) -> None:
    """Validate a module file for unsafe imports."""
    checker = ImportWhitelistChecker()
    checker.check_module(module_path)


def is_safe_import(module_name: str) -> bool:
    """Check if a module name is allowed for import."""
    parts = module_name.split(".")
    for i in range(len(parts)):
        partial = ".".join(parts[: i + 1])
        if partial in BLOCKED_IMPORTS:
            return False
    return True


def is_safe_builtin(name: str) -> bool:
    """Check if a builtin name is allowed."""
    return name not in BLOCKED_BUILTINS
