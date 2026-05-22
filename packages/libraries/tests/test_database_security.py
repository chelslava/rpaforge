"""Tests for RPAForge Database Library security features."""

from __future__ import annotations

import pytest

sqlalchemy = pytest.importorskip(
    "sqlalchemy", reason="SQLAlchemy not installed (database extra required)"
)


class TestDatabaseSecurity:
    """Security and validation tests for Database library."""

    def test_import_library(self):
        """Test Database library can be imported."""
        from rpaforge_libraries.Database import Database

        lib = Database()
        assert lib is not None

    def test_library_is_decorated(self):
        """Test Database library has correct metadata."""
        from rpaforge_libraries.Database import Database

        assert hasattr(Database, "_library_meta")
        assert Database._library_name == "Database"

    def test_validate_table_name_rejects_sql_injection(self):
        """Table names must be validated to prevent SQL injection."""
        from rpaforge_libraries.Database.library import _validate_table_name

        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("'; DROP TABLE users; --")

    def test_validate_table_name_rejects_special_chars(self):
        """Table names with special characters should be rejected."""
        from rpaforge_libraries.Database.library import _validate_table_name

        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("table;name")

    def test_validate_table_name_rejects_spaces(self):
        """Table names with spaces should be rejected."""
        from rpaforge_libraries.Database.library import _validate_table_name

        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("table name")

    def test_validate_table_name_rejects_unicode(self):
        """Table names with unicode characters should be rejected."""
        from rpaforge_libraries.Database.library import _validate_table_name

        with pytest.raises(ValueError, match="Invalid table name"):
            _validate_table_name("таблица")

    def test_validate_table_name_accepts_valid_names(self):
        """Valid table names should be accepted."""
        from rpaforge_libraries.Database.library import _validate_table_name

        valid_names = [
            "users",
            "user_data",
            "UserTable123",
            "_temp",
            "a",
            "TABLE_NAME",
        ]
        for name in valid_names:
            _validate_table_name(name)  # Should not raise

    def test_execute_query_rejects_sql_injection(self):
        """Parameterized queries should prevent SQL injection."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})

        injection_attempt = "'; DROP TABLE users; --"
        with pytest.raises(sqlalchemy.exc.OperationalError):
            db.execute_query(injection_attempt)

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 1
        db.disconnect()

    def test_execute_query_with_params_sanitizes_input(self):
        """Parameterized queries should sanitize input."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})

        result = db.execute_query(
            "SELECT * FROM users WHERE name = :name", {"name": "' OR 1=1 --"}
        )
        assert len(result) == 0
        db.disconnect()

    def test_insert_row_sanitizes_table_name(self):
        """Insert should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        db.insert_row("users", {"id": 1})

        with pytest.raises(ValueError, match="Invalid table name"):
            db.insert_row("'; DROP TABLE users; --", {"id": 2})
        db.disconnect()

    def test_update_rows_sanitizes_table_name(self):
        """Update should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"id": 1, "name": "Alice"})

        with pytest.raises(ValueError, match="Invalid table name"):
            db.update_rows("'; DROP TABLE users; --", {"name": "Hacked"})
        db.disconnect()

    def test_delete_rows_sanitizes_table_name(self):
        """Delete should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        db.insert_row("users", {"id": 1})

        with pytest.raises(ValueError, match="Invalid table name"):
            db.delete_rows("'; DROP TABLE users; --")
        db.disconnect()

    def test_row_count_sanitizes_table_name(self):
        """Row count should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        db.insert_row("users", {"id": 1})

        with pytest.raises(ValueError, match="Invalid table name"):
            db.row_count("'; DROP TABLE users; --")
        db.disconnect()

    def test_bulk_insert_sanitizes_table_name(self):
        """Bulk insert should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        db.insert_row("users", {"id": 1})

        with pytest.raises(ValueError, match="Invalid table name"):
            db.bulk_insert("'; DROP TABLE users; --", [{"id": 2}])
        db.disconnect()

    def test_get_column_names_sanitizes_table_name(self):
        """Get column names should validate table name."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")

        with pytest.raises(ValueError, match="Invalid table name"):
            db.get_column_names("'; DROP TABLE users; --")
        db.disconnect()

    def test_get_table_names_returns_valid_tables(self):
        """Get table names should return actual table names."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        db.execute_query("CREATE TABLE products (id INTEGER PRIMARY KEY)")

        tables = db.get_table_names()
        assert "users" in tables
        assert "products" in tables
        db.disconnect()


class TestWhereClauseSecurity:
    """Test where clause parameterization."""

    def test_where_clause_with_injection_attempt(self):
        """Where clause parameters should be parameterized."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.insert_row("users", {"name": "Bob"})

        injection = {"name": "' OR 1=1 --"}
        rows_updated = db.update_rows("users", {"name": "Hacked"}, where=injection)
        assert rows_updated == 0

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 2
        db.disconnect()

    def test_where_clause_with_multiple_conditions_injection(self):
        """Multiple where conditions should be parameterized."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)"
        )
        db.insert_row("users", {"name": "Alice", "age": 30})
        db.insert_row("users", {"name": "Bob", "age": 25})

        injection = {"name": "' OR 1=1 --", "age": 30}
        count = db.row_count("users", where=injection)
        assert count == 0
        db.disconnect()


class TestDatabaseNormalOperation:
    """Test normal database operations still work."""

    def test_insert_and_select(self):
        """Test normal insert and select."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"
        db.disconnect()

    def test_update_and_delete(self):
        """Test normal update and delete."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.update_rows("users", {"name": "Bob"}, where={"name": "Alice"})
        result = db.execute_query("SELECT * FROM users WHERE name = 'Bob'")
        assert len(result) == 1
        db.delete_rows("users", where={"name": "Bob"})
        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 0
        db.disconnect()

    def test_where_clause_normal(self):
        """Test normal where clause operations."""
        db = _DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, age INTEGER)")
        db.insert_row("users", {"age": 30})
        db.insert_row("users", {"age": 25})

        count = db.row_count("users", where={"age": 30})
        assert count == 1
        db.disconnect()


class _DatabaseLibrary:
    """Internal database library for testing with parameterized queries."""

    def __init__(self, connection_string: str = ":memory:"):
        self._connection_string = f"sqlite:///{connection_string}"
        self._engine = None
        self._connection = None

    def connect(self) -> None:
        from sqlalchemy import create_engine

        self._engine = create_engine(self._connection_string)
        self._connection = self._engine.connect()

    def disconnect(self) -> None:
        if self._connection:
            self._connection.close()
            self._connection = None
        if self._engine:
            self._engine.dispose()
            self._engine = None

    def execute_query(self, query: str, params: dict | None = None) -> list[dict]:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        result = self._connection.execute(text(query), params or {})
        if result.returns_rows:
            columns = result.keys()
            rows = [dict(zip(columns, row, strict=False)) for row in result.fetchall()]
            return rows
        return []

    def insert_row(self, table: str, data: dict) -> int:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        columns = ", ".join(data)
        placeholders = ", ".join(f":{k}" for k in data)
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        result = self._connection.execute(text(query), data)
        self._connection.commit()
        return result.rowcount

    def update_rows(self, table: str, data: dict, where: dict | None = None) -> int:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        set_clause = ", ".join(f"{k} = :{k}" for k in data)
        query = f"UPDATE {table} SET {set_clause}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {**data, **{f"where_{k}": v for k, v in where.items()}}
        else:
            params = data

        result = self._connection.execute(text(query), params)
        self._connection.commit()
        return result.rowcount

    def delete_rows(self, table: str, where: dict | None = None) -> int:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        query = f"DELETE FROM {table}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {f"where_{k}": v for k, v in where.items()}
        else:
            params = {}

        result = self._connection.execute(text(query), params)
        self._connection.commit()
        return result.rowcount

    def row_count(self, table: str, where: dict | None = None) -> int:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        query = f"SELECT COUNT(*) FROM {table}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {f"where_{k}": v for k, v in where.items()}
        else:
            params = {}

        result = self._connection.execute(text(query), params)
        return result.scalar()

    def get_table_names(self) -> list[str]:
        if not self._engine:
            raise ValueError("Not connected to database")

        from sqlalchemy import inspect

        inspector = inspect(self._engine)
        return inspector.get_table_names()

    def get_column_names(self, table: str) -> list[str]:
        if not self._engine:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        from sqlalchemy import inspect

        inspector = inspect(self._engine)
        columns = inspector.get_columns(table)
        return [col["name"] for col in columns]

    def bulk_insert(self, table: str, rows: list[dict]) -> int:
        from sqlalchemy import text

        if not self._connection:
            raise ValueError("Not connected to database")

        from rpaforge_libraries.Database.library import _validate_table_name

        _validate_table_name(table)

        if not rows:
            return 0
        columns = ", ".join(rows[0])
        placeholders = ", ".join(f":{k}" for k in rows[0])
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        _, text_type = self._sqlalchemy
        result = self._connection.execute(text(query), rows)
        self._connection.commit()
        return result.rowcount

    @property
    def _sqlalchemy(self):
        from sqlalchemy import create_engine, text

        return create_engine, text
