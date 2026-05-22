# DataFrames Library

## Overview

DataFrames is a tabular data operations library powered by Polars. It provides high-performance data manipulation with support for filtering, sorting, aggregation, joins, and file I/O operations.

## Installation

```bash
pip install rpaforge-libraries[dataframes]
```

## Keywords

### read_csv
**Description:** Read a CSV file into a named DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the CSV file |
| frame_name | str | No | Name for the DataFrame (default: 'df') |
| separator | str | No | Column separator character (default: ',') |
| has_header | bool | No | First row contains headers (default: True) |

**Returns:** str - Name of the loaded DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.read_csv("data.csv", frame_name="sales")
dfs.read_csv("data.tsv", separator="\t", frame_name="tsv_data")
```

### read_excel
**Description:** Read an Excel file into a named DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the Excel file |
| frame_name | str | No | Name for the DataFrame (default: 'df') |
| sheet | str \| None | No | Sheet name to read |

**Returns:** str - Name of the loaded DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.read_excel("report.xlsx", frame_name="data")
dfs.read_excel("report.xlsx", sheet="Q1", frame_name="q1_data")
```

### read_json
**Description:** Read a JSON file into a named DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str | Yes | Path to the JSON file |
| frame_name | str | No | Name for the DataFrame (default: 'df') |

**Returns:** str - Name of the loaded DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.read_json("data.json", frame_name="json_data")
```

### from_list
**Description:** Create a DataFrame from a list of dictionaries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| data | list | Yes | List of dictionaries with same keys |
| frame_name | str | No | Name for the DataFrame (default: 'df') |

**Returns:** str - Name of the created DataFrame

**Example:**
```python
dfs = DataFrames()
data = [
    {"name": "John", "age": 30},
    {"name": "Jane", "age": 25},
]
dfs.from_list(data, frame_name="people")
```

### write_csv
**Description:** Write a DataFrame to a CSV file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| path | str | Yes | Output file path |
| separator | str | No | Column separator (default: ',') |

**Returns:** str - Path where the file was saved

**Example:**
```python
dfs = DataFrames()
dfs.read_csv("input.csv")
dfs.write_csv("output.csv", separator=",")
```

### write_excel
**Description:** Write a DataFrame to an Excel file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| path | str | Yes | Output file path |
| sheet | str | No | Sheet name (default: 'Sheet1') |

**Returns:** str - Path where the file was saved

**Example:**
```python
dfs = DataFrames()
dfs.write_excel("output.xlsx", sheet="Results")
```

### write_json
**Description:** Write a DataFrame to a JSON file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| path | str | Yes | Output file path |

**Returns:** str - Path where the file was saved

**Example:**
```python
dfs = DataFrames()
dfs.write_json("output.json")
```

### get_shape
**Description:** Get the dimensions of a DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |

**Returns:** dict[str, int] - Dictionary with 'rows' and 'cols' counts

**Example:**
```python
dfs = DataFrames()
shape = dfs.get_shape("sales")
print(f"{shape['rows']} rows x {shape['cols']} columns")
```

### get_columns
**Description:** Get the column names of a DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |

**Returns:** list[str] - List of column names

**Example:**
```python
dfs = DataFrames()
columns = dfs.get_columns("sales")
```

### to_list
**Description:** Convert a DataFrame to a list of dictionaries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |

**Returns:** list[dict[str, Any]] - All rows as dictionaries

**Example:**
```python
dfs = DataFrames()
rows = dfs.to_list("sales")
for row in rows:
    print(row)
```

### head
**Description:** Get the first N rows of a DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |
| n | int | No | Number of rows (default: 5) |

**Returns:** list[dict[str, Any]] - First N rows

**Example:**
```python
dfs = DataFrames()
first = dfs.head("sales", n=10)
```

### tail
**Description:** Get the last N rows of a DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |
| n | int | No | Number of rows (default: 5) |

**Returns:** list[dict[str, Any]] - Last N rows

**Example:**
```python
dfs = DataFrames()
last = dfs.tail("sales", n=5)
```

### describe
**Description:** Get descriptive statistics for all columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |

**Returns:** list[dict[str, Any]] - Statistical summary

**Example:**
```python
dfs = DataFrames()
stats = dfs.describe("sales")
```

### filter_rows
**Description:** Filter rows by a column condition.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| column | str | Yes | Column to filter on |
| operator | str | Yes | Comparison operator (==, !=, >, >=, <, <=, contains, starts_with, ends_with, is_null, is_not_null) |
| value | str | No | Value to compare against |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.filter_rows("sales", "amount", ">", "1000", result_frame="big_sales")
dfs.filter_rows("users", "name", "contains", "John", result_frame="johns")
```

### select_columns
**Description:** Keep only specified columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| columns | list | Yes | Columns to keep |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.select_columns("sales", ["name", "amount"], result_frame="summary")
```

### drop_columns
**Description:** Remove specified columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| columns | list | Yes | Columns to drop |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.drop_columns("sales", ["internal_id", "notes"], result_frame="cleaned")
```

### slice_rows
**Description:** Return a slice of rows.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| start | int | Yes | Starting row index |
| length | int \| None | No | Number of rows (None for all) |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.slice_rows("sales", start=10, length=20, result_frame="sample")
```

### sort
**Description:** Sort a DataFrame by columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| by | list | Yes | Columns to sort by |
| descending | bool | No | Sort order (default: False) |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.sort("sales", by=["amount"], descending=True, result_frame="sorted_sales")
dfs.sort("data", by=["name", "age"], descending=False)
```

### rename_column
**Description:** Rename a single column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| old_name | str | Yes | Current column name |
| new_name | str | Yes | New column name |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.rename_column("sales", "amount", "total_amount", result_frame="renamed")
```

### drop_nulls
**Description:** Remove rows with null values.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| subset | list \| None | No | Columns to check (all if None) |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.drop_nulls("data", subset=["email"], result_frame="clean")
```

### fill_nulls
**Description:** Replace null values with a default value.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| value | Any | Yes | Value to use for nulls |
| column | str \| None | No | Specific column (all if None) |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.fill_nulls("data", value=0, column="amount", result_frame="filled")
dfs.fill_nulls("data", value="unknown")
```

### aggregate
**Description:** Compute a single aggregation over a column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| column | str | Yes | Column to aggregate |
| function | str | No | Aggregation function (sum, mean, min, max, count, std, first, last) |

**Returns:** Any - Scalar aggregation result

**Example:**
```python
dfs = DataFrames()
total = dfs.aggregate("sales", "amount", function="sum")
avg = dfs.aggregate("sales", "amount", function="mean")
```

### group_by
**Description:** Group by columns and aggregate another column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| by | list | Yes | Columns to group by |
| agg_column | str | Yes | Column to aggregate |
| agg_function | str | No | Aggregation function (default: 'sum') |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.group_by("sales", by=["region"], agg_column="amount", agg_function="sum", result_frame="by_region")
```

### join
**Description:** Join two DataFrames on common columns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| left_frame | str | Yes | Left DataFrame name |
| right_frame | str | Yes | Right DataFrame name |
| on | list | Yes | Columns to join on |
| how | str | No | Join type: inner, left, full, cross, semi, anti (default: 'inner') |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.join("sales", "customers", on=["customer_id"], how="left", result_frame="joined")
```

### concat
**Description:** Concatenate DataFrames vertically.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frames | list | Yes | List of DataFrame names to concatenate |
| result_frame | str \| None | No | Output DataFrame name |

**Returns:** str - Name of the resulting DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.concat(["sales_jan", "sales_feb", "sales_mar"], result_frame="annual_sales")
```

### list_frames
**Description:** List all loaded DataFrames.

**Returns:** list[str] - List of DataFrame names

**Example:**
```python
dfs = DataFrames()
frames = dfs.list_frames()
```

### drop_frame
**Description:** Remove a DataFrame from memory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | DataFrame name |

**Returns:** None

**Example:**
```python
dfs = DataFrames()
dfs.drop_frame("old_data")
```

### copy_frame
**Description:** Create a copy of a DataFrame.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| frame | str | Yes | Source DataFrame name |
| new_name | str | Yes | New DataFrame name |

**Returns:** str - Name of the copied DataFrame

**Example:**
```python
dfs = DataFrames()
dfs.copy_frame("sales", "sales_backup")
```

## Common Use Cases

- Load and process large CSV/Excel datasets
- Filter and transform tabular data
- Aggregate and summarize statistics
- Join data from multiple sources
- Export processed data to various formats
- Clean and pre-process data for analysis
- Transform data pipeline stages
- High-performance bulk data operations
