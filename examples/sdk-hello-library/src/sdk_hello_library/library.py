"""HelloWorld — a minimal example RPA library.

Copy this file as a starting point for your own RPAForge library. See
docs/developer-guide/writing-a-library.md for the full guide.
"""

from __future__ import annotations

from rpaforge.core.activity import activity, library, output, param


@library(name="HelloWorld", category="Examples", icon="👋")
class HelloWorld:
    """Example library demonstrating the RPAForge Library Development SDK."""

    @activity(name="Greet", category="Examples")
    @param("name", type="string", description="Who to greet")
    @output("The greeting message")
    def greet(self, name: str = "World") -> str:
        """Return a greeting for `name`."""
        return f"Hello, {name}!"

    @activity(name="Add Numbers", category="Examples")
    @param("a", type="float", description="First number")
    @param("b", type="float", description="Second number")
    @output("The sum of a and b")
    def add_numbers(self, a: float, b: float) -> float:
        """Return the sum of two numbers."""
        return a + b
