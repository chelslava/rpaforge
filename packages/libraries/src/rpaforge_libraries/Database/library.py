"""RPAForge Database Library - Database operations using SQLAlchemy."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.database")


@library(name="Database", category="Data", icon="🗄️")
class Database:
    """Database operations library using SQLAlchemy."""

    def __init__(self, connection_string: str | None = None) -> None:
        self._connection_string = connection_string
        self._engine = None
        self._connection = None

    @property
    def _sqlalchemy(self):
        try:
            from sqlalchemy import create_engine, text

            return create_engine, text
        except ImportError as err:
            raise ImportError(
                "sqlalchemy is required for Database library. "
                "Install it with: pip install rpaforge-libraries[database]"
            ) from err

    @activity(name="Connect To Database", category="Database")
    @tags("connection", "database")
    @output("Connection status")
    def connect_to_database(self, connection_string: str) -> str:
        """Connect to a database.

        :param connection_string: Database connection string.
        :returns: Connection status message.
        """
        create_engine, _ = self._sqlalchemy

        self._connection_string = connection_string
        self._engine = create_engine(connection_string)
        self._connection = self._engine.connect()
        logger.info(f"Connected to database")
        return "Connected"

    @activity(name="Disconnect From Database", category="Database")
    @tags("connection", "database")
    def disconnect_from_database(self) -> None:
        """Disconnect from the current database."""
        if self._connection:
            self._connection.close()
            self._connection = None
        if self._engine:
            self._engine.dispose()
            self._engine = None
        logger.info("Disconnected from database")

    @activity(name="Execute Query", category="Database")
    @tags("query", "sql")
    @output("Query result as list of dictionaries")
    def execute_query(
        self, query: str, params: dict | None = None
    ) -> list[dict[str, Any]]:
        """Execute a SELECT query and return results.

        :param query: SQL query to execute.
        :param params: Query parameters.
        :returns: List of dictionaries with query results.
        """
        _, text = self._sqlalchemy

        if not self._connection:
            raise ValueError("Not connected to database")

        result = self._connection.execute(text(query), params or {})
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        logger.info(f"Query returned {len(rows)} rows")
        return rows

    @activity(name="Execute Script", category="Database")
    @tags("script", "sql")
    @output("Number of affected rows")
    def execute_script(self, script: str) -> int:
        """Execute a SQL script (INSERT, UPDATE, DELETE).

        :param script: SQL script to execute.
        :returns: Number of affected rows.
        """
        _, text = self._sqlalchemy

        if not self._connection:
            raise ValueError("Not connected to database")

        result = self._connection.execute(text(script))
        self._connection.commit()
        affected = result.rowcount
        logger.info(f"Script executed, {affected} rows affected")
        return affected

    @activity(name="Insert Row", category="Database")
    @tags("insert", "table")
    @output("Number of inserted rows")
    def insert_row(self, table: str, data: dict[str, Any]) -> int:
        """Insert a row into a table.

        :param table: Table name.
        :param data: Dictionary with column names and values.
        :returns: Number of inserted rows.
        """
        if not self._connection:
            raise ValueError("Not connected to database")

        columns = ", ".join(data.keys())
        placeholders = ", ".join(f":{k}" for k in data.keys())
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), data)
        self._connection.commit()
        logger.info(f"Inserted row into {table}")
        return result.rowcount

    @activity(name="Update Rows", category="Database")
    @tags("update", "table")
    @output("Number of updated rows")
    def update_rows(
        self, table: str, data: dict[str, Any], where: str | None = None
    ) -> int:
        """Update rows in a table.

        :param table: Table name.
        :param data: Dictionary with column names and new values.
        :param where: WHERE clause (without 'WHERE').
        :returns: Number of updated rows.
        """
        if not self._connection:
            raise ValueError("Not connected to database")

        set_clause = ", ".join(f"{k} = :{k}" for k in data.keys())
        query = f"UPDATE {table} SET {set_clause}"
        if where:
            query += f" WHERE {where}"

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), data)
        self._connection.commit()
        logger.info(f"Updated {result.rowcount} rows in {table}")
        return result.rowcount

    @activity(name="Delete Rows", category="Database")
    @tags("delete", "table")
    @output("Number of deleted rows")
    def delete_rows(self, table: str, where: str | None = None) -> int:
        """Delete rows from a table.

        :param table: Table name.
        :param where: WHERE clause (without 'WHERE').
        :returns: Number of deleted rows.
        """
        if not self._connection:
            raise ValueError("Not connected to database")

        query = f"DELETE FROM {table}"
        if where:
            query += f" WHERE {where}"

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query))
        self._connection.commit()
        logger.info(f"Deleted {result.rowcount} rows from {table}")
        return result.rowcount

    @activity(name="Get Table Names", category="Database")
    @tags("metadata", "tables")
    @output("List of table names")
    def get_table_names(self) -> list[str]:
        """Get list of table names in the database.

        :returns: List of table names.
        """
        if not self._engine:
            raise ValueError("Not connected to database")

        from sqlalchemy import inspect

        inspector = inspect(self._engine)
        return inspector.get_table_names()

    @activity(name="Get Column Names", category="Database")
    @tags("metadata", "columns")
    @output("List of column names")
    def get_column_names(self, table: str) -> list[str]:
        """Get list of column names in a table.

        :param table: Table name.
        :returns: List of column names.
        """
        if not self._engine:
            raise ValueError("Not connected to database")

        from sqlalchemy import inspect

        inspector = inspect(self._engine)
        columns = inspector.get_columns(table)
        return [col["name"] for col in columns]

    @activity(name="Row Count", category="Database")
    @tags("count", "table")
    @output("Number of rows")
    def row_count(self, table: str, where: str | None = None) -> int:
        """Count rows in a table.

        :param table: Table name.
        :param where: WHERE clause (without 'WHERE').
        :returns: Number of rows.
        """
        if not self._connection:
            raise ValueError("Not connected to database")

        query = f"SELECT COUNT(*) FROM {table}"
        if where:
            query += f" WHERE {where}"

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query))
        return result.scalar()

    @activity(name="Begin Transaction", category="Database")
    @tags("transaction")
    def begin_transaction(self) -> None:
        """Begin a database transaction."""
        if not self._connection:
            raise ValueError("Not connected to database")
        self._connection.begin()
        logger.info("Transaction started")

    @activity(name="Commit Transaction", category="Database")
    @tags("transaction")
    def commit_transaction(self) -> None:
        """Commit the current transaction."""
        if not self._connection:
            raise ValueError("Not connected to database")
        self._connection.commit()
        logger.info("Transaction committed")

    @activity(name="Rollback Transaction", category="Database")
    @tags("transaction")
    def rollback_transaction(self) -> None:
        """Rollback the current transaction."""
        if not self._connection:
            raise ValueError("Not connected to database")
        self._connection.rollback()
        logger.info("Transaction rolled back")
