# File Library

## Overview

File is a file system operations library. It provides comprehensive utilities for file and directory manipulation including read/write operations, path handling, and file management tasks.

## Installation

No additional dependencies required.

## Keywords

### create_file
**Description:** Create a new file with optional content.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the file to create |
| content | str | No | Initial content to write (default: '') |
| encoding | str | No | File encoding (default: 'utf-8') |
| overwrite | bool | No | Whether to overwrite existing file (default: False) |

**Returns:** str - Absolute path to the created file

**Example:**
```python
file = File()
file.create_file("output.txt", "Hello World")
file.create_file("data/config.json", '{"key": "value"}')
```

### read_file
**Description:** Read the content of a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the file to read |
| encoding | str | No | File encoding (default: 'utf-8') |
| as_lines | bool | No | Return as list of lines (default: False) |
| strip_lines | bool | No | Strip whitespace from lines (default: True) |
| skip_empty | bool | No | Skip empty lines (default: False) |

**Returns:** str \| list[str] - File content as string or list of lines

**Example:**
```python
file = File()
content = file.read_file("config.txt")
lines = file.read_file("data.txt", as_lines=True, skip_empty=True)
```

### write_file
**Description:** Write content to a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the file to write |
| content | str \| list[str] | Yes | Content to write |
| encoding | str | No | File encoding (default: 'utf-8') |
| append | bool | No | Append to existing file (default: False) |

**Returns:** str - Absolute path to the written file

**Example:**
```python
file = File()
file.write_file("output.txt", "Hello World")
file.write_file("log.txt", ["Line 1", "Line 2"], append=True)
```

### delete_file
**Description:** Delete a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the file to delete |
| missing_ok | bool | No | Ignore if file doesn't exist (default: True) |

**Returns:** bool - True if file was deleted, False if it didn't exist

**Example:**
```python
file = File()
file.delete_file("old_file.txt")
file.delete_file("missing.txt", missing_ok=True)
```

### copy_file
**Description:** Copy a file to a new location.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | str \| Path | Yes | Path to the source file |
| destination | str \| Path | Yes | Path to the destination file or directory |
| overwrite | bool | No | Whether to overwrite existing file (default: True) |

**Returns:** str - Absolute path to the copied file

**Example:**
```python
file = File()
file.copy_file("backup/old.txt", "current.txt")
file.copy_file("file.txt", "/mnt/data/")
```

### move_file
**Description:** Move a file to a new location.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | str \| Path | Yes | Path to the source file |
| destination | str \| Path | Yes | Path to the destination file or directory |
| overwrite | bool | No | Whether to overwrite existing file (default: True) |

**Returns:** str - Absolute path to the moved file

**Example:**
```python
file = File()
file.move_file("temp/file.txt", "archive/")
```

### path_exists
**Description:** Check if a path exists.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to check |
| path_type | str | No | Type to check: 'file', 'directory', 'any' (default: 'any') |

**Returns:** bool - True if path exists and matches type

**Example:**
```python
file = File()
exists = file.path_exists("config.json")
exists = file.path_exists("my_folder", path_type="directory")
exists = file.path_exists("file.txt", path_type="file")
```

### get_file_info
**Description:** Get detailed information about a file.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the file |

**Returns:** dict[str, Any] - Dictionary with file information

**Example:**
```python
file = File()
info = file.get_file_info("document.pdf")
print(f"Size: {info['size_kb']} KB")
print(f"Created: {info['created']}")
```

### list_files
**Description:** List files in a directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| directory | str \| Path | Yes | Path to the directory |
| pattern | str | No | Glob pattern to filter files (default: '*') |
| recursive | bool | No | Search recursively (default: False) |

**Returns:** list[str] - List of file paths matching the pattern

**Example:**
```python
file = File()
files = file.list_files("/path/to/dir")
files = file.list_files("/path/to/dir", "*.txt")
files = file.list_files("/path/to/dir", recursive=True)
```

### create_directory
**Description:** Create a directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the directory to create |
| exist_ok | bool | No | Ignore if directory already exists (default: True) |

**Returns:** str - Absolute path to the created directory

**Example:**
```python
file = File()
file.create_directory("output")
file.create_directory("output/archive/2024", exist_ok=True)
```

### delete_directory
**Description:** Delete a directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to the directory to delete |
| recursive | bool | No | Delete non-empty directories (default: False) |
| missing_ok | bool | No | Ignore if directory doesn't exist (default: True) |

**Returns:** bool - True if directory was deleted, False if it didn't exist

**Example:**
```python
file = File()
file.delete_directory("temp")
file.delete_directory("old_data", recursive=True)
```

### get_current_directory
**Description:** Get the current working directory.

**Returns:** str - Absolute path to current working directory

**Example:**
```python
file = File()
cwd = file.get_current_directory()
```

### set_current_directory
**Description:** Change the current working directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Path to set as current directory |

**Returns:** str - The new current working directory

**Example:**
```python
file = File()
file.set_current_directory("/mnt/data")
```

### combine_paths
**Description:** Combine multiple path segments into a single path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| *paths | str \| Path | Yes | Path segments to combine |

**Returns:** str - Combined path

**Example:**
```python
file = File()
path = file.combine_paths("/dir", "subdir", "file.txt")
path = file.combine_paths("data", "2024", "report.csv")
```

### get_absolute_path
**Description:** Convert a relative path to an absolute path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | Relative or absolute path |

**Returns:** str - Absolute path

**Example:**
```python
file = File()
abs_path = file.get_absolute_path("rel/path.txt")
```

### rename_file
**Description:** Rename a file in the same directory.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | str \| Path | Yes | Path to the source file |
| new_name | str | Yes | New file name (not path, just the name) |

**Returns:** str - Absolute path to the renamed file

**Example:**
```python
file = File()
file.rename_file("old_name.txt", "new_name.txt")
```

### get_path_part
**Description:** Extract a part from a file path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | str \| Path | Yes | File path |
| part | str | No | Which part to extract: 'name', 'stem', 'extension', 'parent', 'directory' (default: 'name') |

**Returns:** str - The extracted path part

**Example:**
```python
file = File()
name = file.get_path_part("/path/to/file.txt", "name")
ext = file.get_path_part("document.pdf", "extension")
dir_path = file.get_path_part("/path/to/file.txt", "parent")
```

## Common Use Cases

- Read configuration files
- Process log files line by line
- Create output directories
- Copy/move files between locations
- Delete temporary files
- List files by pattern (glob)
- Validate file existence before processing
- Get file metadata for logging
- Build dynamic file paths
- Work with relative and absolute paths
