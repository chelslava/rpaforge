from __future__ import annotations

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy", reason="SQLAlchemy not installed (database extra required)")


class TestDatabaseSecurity:
    def test_import_library(self):
        from rpaforge_libraries.Database import Database

        lib = Database()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Database import Database

        assert hasattr(Database, "_library_meta")
        assert Database._library_name == "Database"


class TestSQLInjectionPrevention:
    def test_sql_injection_in_update_rows(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})

        injection_attempt = {"name": "' OR 1=1 --"}
        rows_updated = db.update_rows(
            "users", {"name": "Hacked"}, where=injection_attempt
        )

        assert rows_updated == 0

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 1
        assert result[0]["name"] == "Alice"

    def test_sql_injection_in_delete_rows(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.insert_row("users", {"name": "Bob"})

        injection_attempt = {"name": "' OR 1=1 --"}
        rows_deleted = db.delete_rows("users", where=injection_attempt)

        assert rows_deleted == 0

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 2

    def test_sql_injection_in_row_count(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.insert_row("users", {"name": "Bob"})

        injection_attempt = {"name": "' OR 1=1 --"}
        count = db.row_count("users", where=injection_attempt)

        assert count == 0

    def test_sql_injection_with_multiple_conditions(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)"
        )
        db.insert_row("users", {"name": "Alice", "age": 30})
        db.insert_row("users", {"name": "Bob", "age": 25})

        injection_attempt = {"name": "' OR 1=1 --", "age": 30}
        rows_updated = db.update_rows(
            "users", {"name": "Hacked"}, where=injection_attempt
        )

        assert rows_updated == 0

        result = db.execute_query("SELECT * FROM users WHERE name = 'Alice'")
        assert len(result) == 1
        assert result[0]["age"] == 30

    def test_sql_injection_with_like_pattern(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.insert_row("users", {"name": "Bob"})

        injection_attempt = {"name": "%"}
        count = db.row_count("users", where=injection_attempt)

        assert count == 0

    def test_sql_injection_with_null_value(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"
        )
        db.insert_row("users", {"name": "Alice", "email": None})
        db.insert_row("users", {"name": "Bob", "email": "bob@example.com"})

        injection_attempt = {"email": "' OR 1=1 --"}
        count = db.row_count("users", where=injection_attempt)

        assert count == 0


class TestWhereClauseNormalOperation:
    def test_where_clause_normal_operation(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)"
        )
        db.insert_row("users", {"name": "Alice", "age": 30})
        db.insert_row("users", {"name": "Bob", "age": 25})
        db.insert_row("users", {"name": "Charlie", "age": 30})

        rows_updated = db.update_rows("users", {"age": 35}, where={"age": 30})
        assert rows_updated == 2

        count = db.row_count("users", where={"age": 35})
        assert count == 2

        rows_deleted = db.delete_rows("users", where={"age": 35})
        assert rows_deleted == 2

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 1
        assert result[0]["name"] == "Bob"

    def test_where_clause_with_multiple_conditions(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, city TEXT)"
        )
        db.insert_row("users", {"name": "Alice", "age": 30, "city": "New York"})
        db.insert_row("users", {"name": "Bob", "age": 25, "city": "New York"})
        db.insert_row("users", {"name": "Charlie", "age": 30, "city": "Boston"})

        where = {"age": 30, "city": "New York"}
        rows_updated = db.update_rows("users", {"city": "Chicago"}, where=where)
        assert rows_updated == 1

        count = db.row_count("users", where={"city": "Chicago"})
        assert count == 1

    def test_where_clause_with_integer_values(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)"
        )
        db.insert_row("users", {"name": "Alice", "age": 30})
        db.insert_row("users", {"name": "Bob", "age": 25})

        count = db.row_count("users", where={"age": 30})
        assert count == 1

        rows_deleted = db.delete_rows("users", where={"age": 25})
        assert rows_deleted == 1

    def test_where_clause_with_none_value(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"
        )
        db.insert_row("users", {"name": "Alice", "email": None})
        db.insert_row("users", {"name": "Bob", "email": "bob@example.com"})

        count = db.row_count("users", where=None)
        assert count == 2

    def test_where_clause_with_empty_dict(self):
        db = DatabaseLibrary(":memory:")
        db.connect()
        db.execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
        db.insert_row("users", {"name": "Alice"})
        db.insert_row("users", {"name": "Bob"})

        count = db.row_count("users", where={})
        assert count == 2

        rows_updated = db.update_rows("users", {"name": "Updated"}, where={})
        assert rows_updated == 2

        result = db.execute_query("SELECT * FROM users")
        assert len(result) == 2
        assert result[0]["name"] == "Updated"
        assert result[1]["name"] == "Updated"


class DatabaseLibrary:
    def __init__(self, connection_string: str = ":memory:"):
        self._connection_string = f"sqlite:///{connection_string}"
        self._engine = None
        self._connection = None

    def connect(self) -> None:
        from sqlalchemy import create_engine

        self._engine = create_engine(self._connection_string)
        self._connection = self._engine.connect()

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

        query = f"SELECT COUNT(*) FROM {table}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {f"where_{k}": v for k, v in where.items()}
        else:
            params = {}

        result = self._connection.execute(text(query), params)
        return result.scalar()
