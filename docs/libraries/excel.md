# Excel Library

## Overview

Excel is a file operations library for reading and writing Excel (XLSX) files using openpyxl. It enables automation of spreadsheet manipulation, data extraction, and report generation.

## Installation

```bash
pip install rpaforge-libraries[excel]
```

## Keywords

### open_workbook
**Description:** Open an existing Excel workbook.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the Excel file |
| read_only | bool | No | Open in read-only mode (default: False) |

**Returns:** str - Path to the opened workbook

**Example:**
```python
xls = Excel()
path = xls.open_workbook("report.xlsx")
path = xls.open_workbook("archive/2024.xlsx", read_only=True)
```

### create_workbook
**Description:** Create a new Excel workbook.

**Returns:** str - Identifier for the new workbook ("new_workbook")

**Example:**
```python
xls = Excel()
xls.create_workbook()
```

### close_workbook
**Description:** Close the current workbook.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| save | bool | No | Save changes before closing (default: False) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.open_workbook("data.xlsx")
# ... operations ...
xls.close_workbook(save=True)
```

### save_workbook
**Description:** Save the current workbook to a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path \| None | No | Save path (uses current path if None) |

**Returns:** str - Path where workbook was saved

**Example:**
```python
xls = Excel()
xls.open_workbook("template.xlsx")
xls.save_workbook("output.xlsx")
```

### get_sheet_names
**Description:** Get all sheet names in the workbook.

**Returns:** list[str] - List of sheet names

**Example:**
```python
xls = Excel()
xls.open_workbook("data.xlsx")
sheets = xls.get_sheet_names()
```

### get_active_sheet
**Description:** Get the name of the currently active sheet.

**Returns:** str - Active sheet name

**Example:**
```python
xls = Excel()
active = xls.get_active_sheet()
```

### set_active_sheet
**Description:** Set a specific sheet as the active sheet.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Sheet name |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.set_active_sheet("Sheet2")
```

### create_sheet
**Description:** Create a new sheet in the workbook.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Sheet name |
| index | int \| None | No | Position to insert at |

**Returns:** str - Name of the created sheet

**Example:**
```python
xls = Excel()
new_sheet = xls.create_sheet("Data")
new_sheet = xls.create_sheet("Summary", index=0)
```

### delete_sheet
**Description:** Delete a sheet from the workbook.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Sheet name |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.delete_sheet("OldData")
```

### read_cell
**Description:** Read the value of a specific cell.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| cell | str | Yes | Cell reference (e.g., "A1", "B5") |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** Any - Cell value

**Example:**
```python
xls = Excel()
xls.open_workbook("data.xlsx")
value = xls.read_cell("A1")
value = xls.read_cell("B2", sheet="Sheet2")
```

### write_cell
**Description:** Write a value to a specific cell.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| cell | str | Yes | Cell reference |
| value | Any | Yes | Value to write |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.open_workbook("data.xlsx")
xls.write_cell("C1", "Total")
xls.write_cell("D1", 1000)
```

### read_range
**Description:** Read a range of cells.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| range_spec | str | Yes | Range specification (e.g., "A1:C10", "A:A") |
| sheet | str \| None | No | Sheet name (active if None) |
| as_dict | bool | No | Return as list of dicts with headers (default: False) |

**Returns:** list[list[Any]] \| list[dict[str, Any]] - Cell values

**Example:**
```python
xls = Excel()
xls.open_workbook("data.xlsx")
data = xls.read_range("A1:C10")
data = xls.read_range("A1:D100", as_dict=True)
```

### write_range
**Description:** Write a 2D list to a range of cells.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| start_cell | str | Yes | Top-left cell reference |
| data | list[list[Any]] | Yes | 2D list of values |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
data = [
    ["Name", "Age", "Email"],
    ["John", 30, "john@example.com"],
    ["Jane", 25, "jane@example.com"],
]
xls.write_range("A1", data)
```

### find_row
**Description:** Find the row number containing a value in a specific column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| column | int | Yes | Column number (1-based) |
| value | Any | Yes | Value to search for |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** int \| None - Row number if found, None otherwise

**Example:**
```python
xls = Excel()
row = xls.find_row(column=1, value="John")
if row:
    print(f"Found John in row {row}")
```

### get_row_count
**Description:** Get the number of rows with data.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** int - Number of rows

**Example:**
```python
xls = Excel()
rows = xls.get_row_count()
```

### get_column_count
**Description:** Get the number of columns with data.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** int - Number of columns

**Example:**
```python
xls = Excel()
cols = xls.get_column_count()
```

### insert_rows
**Description:** Insert blank rows above a specified row.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| row | int | Yes | Row number to insert above |
| count | int | No | Number of rows to insert (default: 1) |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.insert_rows(row=2, count=3)  # Insert 3 blank rows above row 2
```

### delete_rows
**Description:** Delete rows starting from a specified row.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| row | int | Yes | Starting row number |
| count | int | No | Number of rows to delete (default: 1) |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.delete_rows(row=5, count=2)  # Delete rows 5 and 6
```

### insert_columns
**Description:** Insert blank columns to the left of a specified column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| col | int | Yes | Column number to insert before |
| count | int | No | Number of columns to insert (default: 1) |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.insert_columns(col=3, count=1)  # Insert column before column C
```

### delete_columns
**Description:** Delete columns starting from a specified column.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| col | int | Yes | Starting column number |
| count | int | No | Number of columns to delete (default: 1) |
| sheet | str \| None | No | Sheet name (active if None) |

**Returns:** None

**Example:**
```python
xls = Excel()
xls.delete_columns(col=4, count=1)  # Delete column D
```

### read_sheet_to_list
**Description:** Read an entire sheet into a list of dictionaries.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| sheet | str \| None | No | Sheet name (active if None) |
| header_row | int | No | Row containing headers (1-based, default: 1) |

**Returns:** list[dict[str, Any]] - List of row dictionaries

**Example:**
```python
xls = Excel()
data = xls.read_sheet_to_list()
# [{"Name": "John", "Age": 30}, ...]
```

### write_list_to_sheet
**Description:** Write a list of dictionaries to a sheet.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| data | list[dict[str, Any]] | Yes | List of dictionaries with identical keys |
| sheet | str \| None | No | Sheet name (active if None) |
| start_row | int | No | Starting row (1-based, default: 1) |
| write_headers | bool | No | Write column headers (default: True) |

**Returns:** None

**Example:**
```python
xls = Excel()
data = [
    {"Name": "John", "Age": 30},
    {"Name": "Jane", "Age": 25},
]
xls.write_list_to_sheet(data, start_row=1, write_headers=True)
```

## Common Use Cases

- Extract data from Excel reports
- Generate Excel reports from databases or APIs
- Merge multiple spreadsheets
- Validate data integrity across files
- Pivot-style data transformation
- Template-based report generation
- Data cleaning and preprocessing
- Batch processing of Excel files
