# Database Library

## Overview

Database is a database operations library using SQLAlchemy. It provides database connectivity, SQL query execution, transaction management, and CRUD operations for relational databases.

## Installation

```bash
pip install rpaforge-libraries[database]
```

## Keywords

### connect_to_database
**Description:** Connect to a database using a connection string.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| connection_string | str | Yes | Database connection string (e.g., 'sqlite:///db.sqlite', 'postgresql://user:pass@host/db') |

**Returns:** str - Connection status message

**Example:**
```python
db = Database()
db.connect_to_database("sqlite:///test.db")
db.connect_to_database("postgresql://user:password@localhost/mydb")
```

### disconnect_from_database
**Description:** Disconnect from the current database.

**Returns:** None

**Example:**
```python
db = Database()
db.disconnect_from_database()
```

### execute_query
**Description:** Execute a SELECT query and return results.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | str | Yes | SQL SELECT query |
| params | dict \| None | No | Query parameters |

**Returns:** list[dict[str, Any]] - List of dictionaries with query results

**Example:**
```python
db = Database()
db.connect_to_database("sqlite:///test.db")
results = db.execute_query("SELECT * FROM users WHERE age > :age", {"age": 30})
for row in results:
    print(row["name"])
```

### execute_script
**Description:** Execute a SQL script (INSERT, UPDATE, DELETE).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| script | str | Yes | SQL script to execute |

**Returns:** int - Number of affected rows

**Example:**
```python
db = Database()
db.execute_script("UPDATE users SET status='active' WHERE LastLogin > '2024-01-01'")
```

### insert_row
**Description:** Insert a single row into a table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |
| data | dict[str, Any] | Yes | Dictionary with column names and values |

**Returns:** int - Number of inserted rows

**Example:**
```python
db = Database()
db.insert_row("users", {"name": "John", "email": "john@example.com", "age": 30})
```

### update_rows
**Description:** Update rows in a table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |
| data | dict[str, Any] | Yes | Dictionary with column names and new values |
| where | dict[str, Any] \| None | No | WHERE clause conditions |

**Returns:** int - Number of updated rows

**Example:**
```python
db = Database()
db.update_rows("users", {"status": "active"}, where={"last_login": "2024-01-01"})
db.update_rows("products", {"price": 99.99})
```

### delete_rows
**Description:** Delete rows from a table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |
| where | dict[str, Any] \| None | No | WHERE clause conditions |

**Returns:** int - Number of deleted rows

**Example:**
```python
db = Database()
db.delete_rows("users", where={"status": "inactive"})
db.delete_rows("logs")  # Delete all rows
```

### get_table_names
**Description:** Get list of table names in the database.

**Returns:** list[str] - List of table names

**Example:**
```python
db = Database()
tables = db.get_table_names()
```

### get_column_names
**Description:** Get list of column names in a table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |

**Returns:** list[str] - List of column names

**Example:**
```python
db = Database()
columns = db.get_column_names("users")
```

### row_count
**Description:** Get the number of rows in a table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |
| where | dict[str, Any] \| None | No | Optional WHERE conditions |

**Returns:** int - Number of rows

**Example:**
```python
db = Database()
count = db.row_count("users")
count = db.row_count("orders", where={"status": "pending"})
```

### begin_transaction
**Description:** Begin a database transaction.

**Returns:** None

**Example:**
```python
db = Database()
db.begin_transaction()
try:
    db.insert_row("orders", data)
    db.update_row("inventory", ...)
    db.commit_transaction()
except:
    db.rollback_transaction()
```

### commit_transaction
**Description:** Commit the current transaction.

**Returns:** None

**Example:**
```python
db = Database()
db.commit_transaction()
```

### rollback_transaction
**Description:** Rollback the current transaction.

**Returns:** None

**Example:**
```python
db = Database()
db.rollback_transaction()
```

### bulk_insert
**Description:** Insert multiple rows using a single batch statement.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table | str | Yes | Table name |
| rows | list[dict[str, Any]] | Yes | List of dictionaries with column mappings |

**Returns:** int - Total number of inserted rows

**Example:**
```python
db = Database()
rows = [
    {"name": "John", "email": "john@example.com"},
    {"name": "Jane", "email": "jane@example.com"},
]
db.bulk_insert("users", rows)
```

### execute_many
**Description:** Execute a parameterized statement once per item in params.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | str | Yes | SQL statement with named placeholders |
| params | list[dict[str, Any]] | Yes | List of parameter dictionaries |

**Returns:** int - Number of affected rows

**Example:**
```python
db = Database()
params = [
    {"name": "John", "age": 30},
    {"name": "Jane", "age": 25},
]
db.execute_many("INSERT INTO users (name, age) VALUES (:name, :age)", params)
```

### export_to_csv
**Description:** Execute a SELECT query and write results to a CSV file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | str | Yes | SQL SELECT query |
| path | str | Yes | Destination file path |
| params | dict[str, Any] \| None | No | Optional query parameters |
| delimiter | str | No | CSV field delimiter (default: ',') |

**Returns:** str - Absolute path of the written file

**Example:**
```python
db = Database()
path = db.export_to_csv("SELECT * FROM users", "users_export.csv")
path = db.export_to_csv("SELECT * FROM orders WHERE date > :date", "orders.csv", {"date": "2024-01-01"})
```

## Common Use Cases

- Connect to SQLite, PostgreSQL, MySQL databases
- Execute ad-hoc SQL queries
- Bulk data import/export
- Transaction management for data integrity
- Schema introspection and metadata queries
- Data synchronization between systems
- Report generation from database queries
- ETL (Extract, Transform, Load) workflows
