from __future__ import annotations

import pytest

from rpaforge.core.library_sandbox import (
    ImportWhitelistChecker,
    SandboxViolationError,
    check_module_imports,
    check_source_imports,
    count_activity_decorators,
    is_safe_builtin,
    is_safe_import,
    resolve_module_source,
    validate_module_package,
)


class TestIsSafeImport:
    def test_safe_module_allowed(self):
        assert is_safe_import("math") is True
        assert is_safe_import("json") is True
        assert is_safe_import("os") is False

    def test_blocked_imports_rejected(self):
        assert is_safe_import("os") is False
        assert is_safe_import("subprocess") is False
        assert is_safe_import("sys") is False
        assert is_safe_import("socket") is False
        assert is_safe_import("http.client") is False

    def test_nested_blocked_module(self):
        assert is_safe_import("os.path") is False
        assert is_safe_import("subprocess.run") is False

    def test_deep_nesting(self):
        assert is_safe_import("math.sqrt") is True
        assert is_safe_import("json.decoder") is True

    def test_os_not_allowed(self):
        assert is_safe_import("os") is False


class TestIsSafeBuiltin:
    def test_safe_builtins_allowed(self):
        assert is_safe_builtin("len") is True
        assert is_safe_builtin("str") is True
        assert is_safe_builtin("abs") is True
        assert is_safe_builtin("all") is True

    def test_blocked_builtins_rejected(self):
        assert is_safe_builtin("eval") is False
        assert is_safe_builtin("exec") is False
        assert is_safe_builtin("compile") is False
        assert is_safe_builtin("__import__") is False
        assert is_safe_builtin("compile") is False


class TestImportWhitelistChecker:
    def test_safe_imports_allowed(self):
        source = """
import math
import json
from datetime import datetime
from typing import List
        """
        checker = ImportWhitelistChecker()
        checker.check_source(source)

    def test_os_import_blocked(self):
        source = "import os"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_subprocess_import_blocked(self):
        source = "import subprocess"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_sys_import_blocked(self):
        source = "import sys"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_star_import_blocked(self):
        source = "from os import *"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_from_os_import_star_blocked(self):
        source = "from os import *"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_os_from_import_blocked(self):
        source = "from os import path"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_eval_call_blocked(self):
        source = "eval('1+1')"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_exec_call_blocked(self):
        source = "exec('x=1')"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_compile_call_blocked(self):
        source = "compile('x=1', '<string>', 'exec')"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_import_call_blocked(self):
        source = "__import__('os')"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_getattr_with_dunder_blocked(self):
        source = "getattr(obj, '__init__')"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError):
            checker.check_source(source)

    def test_multiple_violations_reported(self):
        source = """
import os
import subprocess
from sys import argv
eval('1+1')
        """
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError) as exc_info:
            checker.check_source(source)
        assert exc_info.value is not None

    def test_safe_modules_allowed(self):
        source = """
import math
import json
from datetime import datetime
from typing import List, Dict
import functools
import itertools
        """
        checker = ImportWhitelistChecker()
        checker.check_source(source)

    def test_submodule_of_blocked_blocked(self):
        source = "import os.path"
        checker = ImportWhitelistChecker()
        with pytest.raises(SandboxViolationError):
            checker.check_source(source)


class TestCheckSourceImports:
    def test_valid_source_passes(self):
        source = "import math; x = math.sqrt(4)"
        check_source_imports(source)

    def test_invalid_source_raises(self):
        source = "import os"
        with pytest.raises(SandboxViolationError):
            check_source_imports(source)


class TestCheckModuleImports:
    def test_module_with_safe_imports(self, tmp_path):
        module_file = tmp_path / "safe_module.py"
        module_file.write_text("import math\nimport json\n")
        check_module_imports(str(module_file))

    def test_module_with_os_import_raises(self, tmp_path):
        module_file = tmp_path / "unsafe_module.py"
        module_file.write_text("import os\n")
        with pytest.raises(SandboxViolationError):
            check_module_imports(str(module_file))


class TestStaticModuleResolution:
    def test_resolves_without_executing_package_initializer(
        self, tmp_path, monkeypatch
    ):
        package = tmp_path / "unsafe_plugin"
        package.mkdir()
        marker = tmp_path / "imported"
        (package / "__init__.py").write_text(
            f"from pathlib import Path\nPath({str(marker)!r}).write_text('bad')\n"
        )
        module = package / "library.py"
        module.write_text("class Plugin: pass\n")
        monkeypatch.syspath_prepend(str(tmp_path))

        resolved = resolve_module_source("unsafe_plugin.library")

        assert resolved == module
        assert not marker.exists()

    def test_rejects_non_source_modules(self):
        with pytest.raises(SandboxViolationError):
            resolve_module_source("math")

    def test_rejects_namespace_packages(self, tmp_path, monkeypatch):
        namespace = tmp_path / "namespace_plugin"
        namespace.mkdir()
        (namespace / "library.py").write_text("class Plugin: pass\n")
        monkeypatch.syspath_prepend(str(tmp_path))

        with pytest.raises(SandboxViolationError):
            resolve_module_source("namespace_plugin.library")

    def test_counts_activity_decorators_without_importing(self, tmp_path):
        module = tmp_path / "library.py"
        module.write_text(
            "def activity(*args, **kwargs): return lambda fn: fn\n"
            "@activity()\ndef first(): pass\n"
            "@activity(name='second')\ndef second(): pass\n"
        )

        assert count_activity_decorators(module) == 2

    def test_validates_all_package_sources_before_import(self, tmp_path, monkeypatch):
        package = tmp_path / "plugin"
        package.mkdir()
        (package / "__init__.py").write_text("")
        module = package / "library.py"
        module.write_text("class Plugin: pass\n")
        (package / "side_effect.py").write_text("import os\n")
        monkeypatch.syspath_prepend(str(tmp_path))

        with pytest.raises(SandboxViolationError):
            validate_module_package("plugin.library")


class TestSandboxViolationError:
    def test_error_with_details(self):
        error = SandboxViolationError("Unsafe import", details="os module blocked")
        assert "Unsafe import" in str(error)
        assert "os module blocked" in str(error)

    def test_error_to_dict(self):
        error = SandboxViolationError("Test error", details="test details")
        error_dict = error.to_dict()
        assert error_dict["error"] == "SandboxViolationError"
        assert error_dict["message"] == "Test error"
        assert error_dict["details"] == "test details"

    def test_error_without_details(self):
        error = SandboxViolationError("Test error")
        assert str(error) == "Test error"
