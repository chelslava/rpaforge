"""RPAForge Scripting Library.

Arbitrary Python execution in an isolated child interpreter with a hard
timeout (issue #859): arguments in as ``__rpaforge_args__``, the script's
``result`` variable back as JSON. The child inherits the worker's OS rights
— pair with least-privilege robot policies for untrusted diagrams.
"""

from rpaforge_libraries.Scripting.library import Scripting
from rpaforge_libraries.Scripting.python_runner import (
    ScriptExecutionError,
    run_python_script,
)

__all__ = ["Scripting", "ScriptExecutionError", "run_python_script"]
