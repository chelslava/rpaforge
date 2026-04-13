"""
RPAForge Code Generation Module.

Generates Python code from visual diagrams.
"""

from rpaforge.codegen.python_generator import (
    DiagramValidationError,
    PythonCodeGenerator,
)

CodeGenerator = PythonCodeGenerator

__all__ = [
    "CodeGenerator",
    "PythonCodeGenerator",
    "DiagramValidationError",
]
