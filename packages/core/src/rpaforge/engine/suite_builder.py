"""
RPAForge Process Builder.

Programmatic creation of Robot Framework test suites.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from robot.running import TestSuite, TestCase

if TYPE_CHECKING:
    from collections.abc import Sequence


class ProcessBuilder:
    """Builder for creating Robot Framework processes programmatically.

    This class provides a fluent API for creating test suites
    without writing .robot files.

    Example:
        >>> builder = ProcessBuilder("Invoice Processing")
        >>> builder.add_import("Library", "RPAForge.DesktopUI")
        >>> builder.add_variable("${invoice_path}", "C:/invoices")
        >>> builder.add_task("Process Invoice", [
        ...     ("Open Application", ["excel.exe"]),
        ...     ("Open Workbook", ["${invoice_path}/invoice.xlsx"]),
        ... ])
        >>> suite = builder.build()
    """

    def __init__(self, name: str):
        """Initialize the process builder.

        :param name: Name of the process (suite).
        """
        self._suite = TestSuite(name=name)
        self._imports: list[tuple[str, str, dict[str, Any]]] = []
        self._variables: list[tuple[str, Any]] = []

    @property
    def name(self) -> str:
        """Get the process name."""
        return self._suite.name

    def add_import(
        self,
        import_type: str,
        name: str,
        args: Sequence[str] | None = None,
        alias: str | None = None,
    ) -> ProcessBuilder:
        """Add an import to the process.

        :param import_type: Type of import (Library, Resource, Variables).
        :param name: Name of the library/resource/variables file.
        :param args: Optional arguments for library imports.
        :param alias: Optional alias for library imports.
        :returns: Self for method chaining.
        """
        self._imports.append((import_type, name, {"args": args or [], "alias": alias}))
        return self

    def add_variable(self, name: str, value: Any) -> ProcessBuilder:
        """Add a variable to the process.

        :param name: Variable name (with ${}).
        :param value: Variable value.
        :returns: Self for method chaining.
        """
        self._variables.append((name, value))
        return self

    def add_task(
        self,
        name: str,
        keywords: Sequence[tuple[str, Sequence[Any]]],
        tags: Sequence[str] | None = None,
        setup: tuple[str, Sequence[Any]] | None = None,
        teardown: tuple[str, Sequence[Any]] | None = None,
    ) -> ProcessBuilder:
        """Add a task to the process.

        :param name: Task name.
        :param keywords: List of (keyword_name, args) tuples.
        :param tags: Optional tags for the task.
        :param setup: Optional setup keyword (name, args).
        :param teardown: Optional teardown keyword (name, args).
        :returns: Self for method chaining.

        Example:
            >>> builder.add_task("Login", [
            ...     ("Open Browser", ["https://example.com"]),
            ...     ("Input Text", ["username_field", "user"]),
            ...     ("Input Text", ["password_field", "pass"]),
            ...     ("Click Button", ["login_button"]),
            ... ], tags=["smoke", "auth"])
        """
        test = self._suite.tests.create(name=name)

        if tags:
            test.tags.add(tags)

        if setup:
            test.setup.config(name=setup[0], args=setup[1])

        for kw_name, kw_args in keywords:
            test.body.create_keyword(name=kw_name, args=kw_args)

        if teardown:
            test.teardown.config(name=teardown[0], args=teardown[1])

        return self

    def add_keyword(
        self,
        name: str,
        keywords: Sequence[tuple[str, Sequence[Any]]],
        args: Sequence[str] | None = None,
    ) -> ProcessBuilder:
        """Add a user keyword to the process.

        :param name: Keyword name.
        :param keywords: List of (keyword_name, args) tuples.
        :param args: Optional argument specification.
        :returns: Self for method chaining.
        """
        kw = self._suite.resource.keywords.create(name=name)

        if args:
            kw.args = args

        for step_name, step_args in keywords:
            kw.body.create_keyword(name=step_name, args=step_args)

        return self

    def build(self) -> TestSuite:
        """Build and return the TestSuite.

        :returns: Configured TestSuite ready for execution.
        """
        for import_type, name, options in self._imports:
            if import_type.lower() == "library":
                self._suite.resource.imports.library(
                    name,
                    args=options.get("args", []),
                    alias=options.get("alias"),
                )
            elif import_type.lower() == "resource":
                self._suite.resource.imports.resource(name)
            elif import_type.lower() == "variables":
                self._suite.resource.imports.variables(name)

        for name, value in self._variables:
            self._suite.resource.variables.create(name, value)

        return self._suite

    def run(self, **options: Any) -> Any:
        """Build and execute the process.

        :param options: Options passed to suite.run().
        :returns: Execution result.
        """
        suite = self.build()
        return suite.run(**options)
