"""RPAForge Database Library - Database operations using SQLAlchemy."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags
from rpaforge_libraries.i18n import _

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.database")

_TABLE_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_table_name(table: str) -> None:
    if not _TABLE_NAME_PATTERN.match(table):
        raise ValueError(
            _("Invalid table name '{table}': must match pattern ^[a-zA-Z_][a-zA-Z0-9_]*$").format(table=table)
        )


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
        try:
            self._connection = self._engine.connect()
        except Exception:
            self._engine.dispose()
            self._engine = None
            raise
        logger.info("Connected to database")
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
        self,
        query: str,
        params: dict | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a SELECT query and return results.

        :param query: SQL query to execute.
        :param params: Query parameters.
        :param limit: Maximum number of rows to return (None for all rows).
        :param offset: Number of rows to skip before returning results (requires limit).
        :returns: List of dictionaries with query results.
        """
        _, text = self._sqlalchemy

        if not self._connection:
            raise ValueError(_("Not connected to database"))

        paginated_query = query
        merged_params = dict(params or {})
        if limit is not None:
            paginated_query = f"{paginated_query} LIMIT :_limit OFFSET :_offset"
            merged_params["_limit"] = limit
            merged_params["_offset"] = offset if offset is not None else 0

        result = self._connection.execute(text(paginated_query), merged_params)
        columns = result.keys()
        rows = [dict(zip(columns, row, strict=False)) for row in result.fetchall()]
        logger.info(f"Query returned {len(rows)} rows")
        return rows

    @activity(name="Execute Script", category="Database")
    @tags("script", "sql")
    @output("Number of affected rows")
    def execute_script(self, script: str) -> int:
        """Execute a raw SQL script (INSERT, UPDATE, DELETE).

        .. warning::
            This method executes raw SQL without parameterization.  Never
            interpolate user-supplied data directly into *script* — doing so
            exposes the application to SQL injection.  Use :meth:`insert_row`,
            :meth:`update_rows`, or :meth:`delete_rows` for parameterized DML.

        :param script: SQL script to execute.
        :returns: Number of affected rows.
        """
        _, text = self._sqlalchemy

        if not self._connection:
            raise ValueError(_("Not connected to database"))

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
            raise ValueError(_("Not connected to database"))

        _validate_table_name(table)
        columns = ", ".join(data)
        placeholders = ", ".join(f":{k}" for k in data)
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
        self, table: str, data: dict[str, Any], where: dict[str, Any] | None = None
    ) -> int:
        if not self._connection:
            raise ValueError(_("Not connected to database"))

        _validate_table_name(table)
        set_clause = ", ".join(f"{k} = :{k}" for k in data)
        query = f"UPDATE {table} SET {set_clause}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {**data, **{f"where_{k}": v for k, v in where.items()}}
        else:
            params = data

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), params)
        self._connection.commit()
        logger.info(f"Updated {result.rowcount} rows in {table}")
        return result.rowcount

    @activity(name="Delete Rows", category="Database")
    @tags("delete", "table")
    @output("Number of deleted rows")
    def delete_rows(self, table: str, where: dict[str, Any] | None = None) -> int:
        if not self._connection:
            raise ValueError(_("Not connected to database"))

        _validate_table_name(table)
        query = f"DELETE FROM {table}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {f"where_{k}": v for k, v in where.items()}
        else:
            params = {}

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), params)
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
            raise ValueError(_("Not connected to database"))

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
            raise ValueError(_("Not connected to database"))

        from sqlalchemy import inspect

        inspector = inspect(self._engine)
        columns = inspector.get_columns(table)
        return [col["name"] for col in columns]

    @activity(name="Row Count", category="Database")
    @tags("count", "table")
    @output("Number of rows")
    def row_count(self, table: str, where: dict[str, Any] | None = None) -> int:
        if not self._connection:
            raise ValueError(_("Not connected to database"))

        _validate_table_name(table)
        query = f"SELECT COUNT(*) FROM {table}"
        if where:
            conditions = " AND ".join(f"{k} = :where_{k}" for k in where)
            query += f" WHERE {conditions}"
            params = {f"where_{k}": v for k, v in where.items()}
        else:
            params = {}

        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), params)
        return result.scalar()

    @activity(name="Begin Transaction", category="Database")
    @tags("transaction")
    def begin_transaction(self) -> None:
        """Begin a database transaction."""
        if not self._connection:
            raise ValueError(_("Not connected to database"))
        self._connection.begin()
        logger.info("Transaction started")

    @activity(name="Commit Transaction", category="Database")
    @tags("transaction")
    def commit_transaction(self) -> None:
        """Commit the current transaction."""
        if not self._connection:
            raise ValueError(_("Not connected to database"))
        self._connection.commit()
        logger.info("Transaction committed")

    @activity(name="Rollback Transaction", category="Database")
    @tags("transaction")
    def rollback_transaction(self) -> None:
        """Rollback the current transaction."""
        if not self._connection:
            raise ValueError(_("Not connected to database"))
        self._connection.rollback()
        logger.info("Transaction rolled back")

    @activity(name="Bulk Insert", category="Database")
    @tags("insert", "bulk", "table")
    @output("Number of inserted rows")
    def bulk_insert(self, table: str, rows: list[dict[str, Any]]) -> int:
        """Insert multiple rows using a single batch statement.

        :param table: Table name.
        :param rows: List of dicts mapping column names to values.
        :returns: Total number of inserted rows.
        """
        if not self._connection:
            raise ValueError(_("Not connected to database"))
        if not rows:
            return 0
        _validate_table_name(table)
        columns = ", ".join(rows[0])
        placeholders = ", ".join(f":{k}" for k in rows[0])
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), rows)
        self._connection.commit()
        logger.info(f"Bulk-inserted {result.rowcount} rows into {table}")
        return result.rowcount

    @activity(name="Execute Many", category="Database")
    @tags("query", "bulk")
    @output("Number of affected rows")
    def execute_many(self, query: str, params: list[dict[str, Any]]) -> int:
        """Execute a parameterized statement once per item in params.

        :param query: SQL statement with named placeholders.
        :param params: List of parameter dicts.
        :returns: Number of affected rows.
        """
        if not self._connection:
            raise ValueError(_("Not connected to database"))
        if not params:
            return 0
        _, text = self._sqlalchemy
        result = self._connection.execute(text(query), params)
        self._connection.commit()
        logger.info(f"execute_many affected {result.rowcount} rows")
        return result.rowcount

    @activity(name="Export To CSV", category="Database")
    @tags("export", "csv")
    @output("Path to exported file")
    def export_to_csv(
        self,
        query: str,
        path: str,
        params: dict[str, Any] | None = None,
        delimiter: str = ",",
    ) -> str:
        """Execute a SELECT query and write results to a CSV file.

        :param query: SQL SELECT query.
        :param path: Destination file path.
        :param params: Optional query parameters.
        :param delimiter: CSV field delimiter (default: comma).
        :returns: Absolute path of the written file.
        """
        import csv
        from pathlib import Path

        rows = self.execute_query(query, params or {})
        out = Path(path)
        if not rows:
            out.write_text("")
            return str(out.resolve())
        with out.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=list(rows[0].keys()), delimiter=delimiter
            )
            writer.writeheader()
            writer.writerows(rows)
        logger.info(f"Exported {len(rows)} rows to {path}")
        return str(out.resolve())
