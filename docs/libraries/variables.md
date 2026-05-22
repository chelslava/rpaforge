# Variables Library

## Overview

Variables is a variable management operations library. It provides utilities for setting, getting, clearing, and managing variables with support for various data types including lists, dictionaries, and type conversions.

## Installation

No additional dependencies required.

## Keywords

### set_variable
**Description:** Set a variable value.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name to set |
| value | Any | Yes | Value to set |

**Returns:** Any - The value that was set

**Example:**
```python
vars = Variables()
vars.set_variable("username", "john")
vars.set_variable("count", 42)
vars.set_variable("data", {"key": "value"})
```

### get_variable
**Description:** Get a variable value.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |
| default | Any \| None | No | Default value if variable doesn't exist |

**Returns:** Any - Variable value or default

**Example:**
```python
vars = Variables()
username = vars.get_variable("username")
count = vars.get_variable("count", default=0)
missing = vars.get_variable("missing", default="fallback")
```

### clear_variable
**Description:** Clear (delete) a variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |

**Returns:** bool - True if variable was cleared, False if it didn't exist

**Example:**
```python
vars = Variables()
cleared = vars.clear_variable("old_variable")
```

### variable_exists
**Description:** Check if a variable exists.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |

**Returns:** bool - True if variable exists

**Example:**
```python
vars = Variables()
if vars.variable_exists("username"):
    print("Variable exists")
```

### clear_all_variables
**Description:** Clear all variables.

**Returns:** int - Number of variables that were cleared

**Example:**
```python
vars = Variables()
count = vars.clear_all_variables()
```

### get_variable_names
**Description:** Get all variable names.

**Returns:** list[str] - List of variable names

**Example:**
```python
vars = Variables()
names = vars.get_variable_names()
```

### get_variable_count
**Description:** Get the number of variables.

**Returns:** int - Number of variables

**Example:**
```python
vars = Variables()
count = vars.get_variable_count()
```

### get_all_variables
**Description:** Get all variables as a dictionary.

**Returns:** dict[str, Any] - Dictionary of all variables

**Example:**
```python
vars = Variables()
all_vars = vars.get_all_variables()
```

### set_variables_from_dict
**Description:** Set multiple variables from a dictionary.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| variables | dict[str, Any] | Yes | Dictionary of variable names and values |
| overwrite | bool | No | Whether to overwrite existing variables |

**Returns:** int - Number of variables set

**Example:**
```python
vars = Variables()
data = {"name": "John", "age": 30, "city": "NYC"}
count = vars.set_variables_from_dict(data, overwrite=True)
```

### adjust_variable
**Description:** Increment or decrement a numeric variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |
| amount | int \| float | No | Amount to add or subtract (default: 1) |
| operation | str | No | Operation: 'increment' or 'decrement' |

**Returns:** int \| float - New value after operation

**Example:**
```python
vars = Variables()
vars.set_variable("count", 5)
vars.adjust_variable("count", amount=1)  # Increment
vars.adjust_variable("count", amount=2, operation="decrement")  # Decrement
```

### append_to_list
**Description:** Append a value to a list variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | List variable name |
| value | Any | Yes | Value to append |

**Returns:** list[Any] - Updated list

**Example:**
```python
vars = Variables()
vars.set_variable("items", ["a", "b"])
vars.append_to_list("items", "c")
```

### extend_list
**Description:** Extend a list variable with another list.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | List variable name |
| values | list[Any] | Yes | Values to append |

**Returns:** list[Any] - Updated list

**Example:**
```python
vars = Variables()
vars.set_variable("items", ["a", "b"])
vars.extend_list("items", ["c", "d"])
```

### get_list_length
**Description:** Get the length of a list variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | List variable name |

**Returns:** int - Length of the list

**Example:**
```python
vars = Variables()
length = vars.get_list_length("items")
```

### get_dict_keys
**Description:** Get the keys of a dictionary variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Dictionary variable name |

**Returns:** list[str] - List of keys

**Example:**
```python
vars = Variables()
vars.set_variable("data", {"a": 1, "b": 2})
keys = vars.get_dict_keys("data")
```

### get_dict_value
**Description:** Get a value from a dictionary variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |
| key | str | Yes | Dictionary key |
| default | Any \| None | No | Default value if key doesn't exist |

**Returns:** Any - Dictionary value or default

**Example:**
```python
vars = Variables()
value = vars.get_dict_value("data", "a", default="fallback")
```

### set_dict_value
**Description:** Set a value in a dictionary variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |
| key | str | Yes | Dictionary key |
| value | Any | Yes | Value to set |

**Returns:** dict[str, Any] - Updated dictionary

**Example:**
```python
vars = Variables()
vars.set_variable("data", {"a": 1})
vars.set_dict_value("data", "b", 2)
```

### convert_variable
**Description:** Convert a variable value to a different type.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name to convert |
| target_type | str | No | Target type: 'string', 'integer', 'float', or 'boolean' |

**Returns:** str \| int \| float \| bool - Converted value

**Example:**
```python
vars = Variables()
vars.set_variable("num", "42")
num_int = vars.convert_variable("num", target_type="integer")
num_float = vars.convert_variable("num", target_type="float")
num_bool = vars.convert_variable("num", target_type="boolean")
```

### get_variable_type
**Description:** Get the type of a variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | str | Yes | Variable name |

**Returns:** str - Type name as string

**Example:**
```python
vars = Variables()
vars.set_variable("name", "John")
vars.set_variable("count", 42)
type_name = vars.get_variable_type("name")  # "str"
type_count = vars.get_variable_type("count")  # "int"
```

## Common Use Cases

- Store and retrieve process state
- Pass data between activities
- Manage counters and accumulators
- Build lists and dictionaries incrementally
- Convert between data types
- Check variable existence before use
- Bulk variable initialization from dictionaries
- Debugging and inspection of process variables
- Variable scoping and cleanup
- Type-safe variable management
