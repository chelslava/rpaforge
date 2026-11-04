"""JUnit XML report for ``rpaforge-runner test`` (issue #845).

CI-friendly output compatible with standard JUnit parsers (Jenkins, GitLab,
GitHub test reporters). One ``<testcase>`` per spec; assertion failures map
to ``<failure>``, spec load/conversion errors to ``<error>``.
"""

from __future__ import annotations

from typing import Any
from xml.sax.saxutils import escape

from rpaforge.testing.runner import SpecResult

__all__ = ["build_junit_xml"]


def _attr(value: Any) -> str:
    """Render a double-quoted, escaped XML attribute value."""
    return '"' + escape(str(value), {'"': "&quot;", "\n": "&#10;"}) + '"'


def _testcase(result: SpecResult) -> str:
    name = _attr(result.name)
    classname = _attr(result.diagram)
    time_attr = _attr(f"{result.elapsed_ms / 1000.0:.3f}")

    if result.error:
        body = f"<error message={_attr(result.error)}>{escape(result.error)}</error>"
    elif result.failures:
        joined = "\n".join(result.failures)
        body = (
            f"<failure message={_attr(result.failures[0])}>{escape(joined)}</failure>"
        )
    else:
        body = ""

    if body:
        return (
            f"<testcase name={name} classname={classname} "
            f"time={time_attr}>{body}</testcase>"
        )
    return f"<testcase name={name} classname={classname} time={time_attr}/>"


def build_junit_xml(results: list[SpecResult]) -> str:
    """Render one ``<testsuite>`` covering all spec results."""
    tests = len(results)
    failures = sum(1 for r in results if not r.error and r.failures)
    errors = sum(1 for r in results if r.error)
    total_time = sum(r.elapsed_ms for r in results) / 1000.0
    suite_open = (
        '<testsuite name="rpaforge-test" '
        f'tests="{tests}" failures="{failures}" errors="{errors}" '
        f'time="{total_time:.3f}">'
    )
    cases = "".join(_testcase(r) for r in results)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{suite_open}{cases}</testsuite>'
