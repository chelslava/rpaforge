"""Tests for Database library."""

from __future__ import annotations

import pytest


class TestDatabase:
    """Tests for Database library."""

    def test_import_library(self):
        from rpaforge_libraries.Database import Database

        lib = Database()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Database import Database

        assert hasattr(Database, "_library_meta")
        assert Database._library_name == "Database"

    def test_default_connection_string(self):
        from rpaforge_libraries.Database import Database

        lib = Database()
        assert lib._connection_string is None

    def test_custom_connection_string(self):
        from rpaforge_libraries.Database import Database

        lib = Database(connection_string="sqlite:///:memory:")
        assert lib._connection_string == "sqlite:///:memory:"


class TestDatabaseKeywords:
    """Tests for Database keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.Database import Database

        lib = Database()

        keywords = [
            "connect_to_database",
            "disconnect_from_database",
            "execute_query",
            "execute_script",
            "insert_row",
            "update_rows",
            "delete_rows",
            "get_table_names",
            "get_column_names",
            "row_count",
            "begin_transaction",
            "commit_transaction",
            "rollback_transaction",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"

    def test_connect_to_database_signature(self):
        import inspect

        from rpaforge_libraries.Database import Database

        sig = inspect.signature(Database.connect_to_database)
        params = list(sig.parameters.keys())

        assert "connection_string" in params

    def test_execute_query_signature(self):
        import inspect

        from rpaforge_libraries.Database import Database

        sig = inspect.signature(Database.execute_query)
        params = list(sig.parameters.keys())

        assert "query" in params
        assert "params" in params
