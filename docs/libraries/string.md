# String Library

## Overview

String is a string manipulation operations library. It provides utilities for splitting, joining, replacing, trimming, formatting, case conversion, regex operations, substring extraction, and string validation.

## Installation

No additional dependencies required.

## Keywords

### split
**Description:** Split a string into a list by delimiter.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to split |
| delimiter | str | No | Delimiter to split by (default: ' ') |
| max_splits | int | No | Maximum number of splits (-1 for unlimited) |
| strip_whitespace | bool | No | Whether to strip whitespace from each part |

**Returns:** list[str] - List of string parts

**Example:**
```python
str_lib = String()
parts = str_lib.split("one two three")
# Returns ["one", "two", "three"]
parts = str_lib.split("a,b,c", delimiter=",")
parts = str_lib.split("one,two,three", max_splits=1)
```

### join
**Description:** Join a list of strings with a delimiter.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| items | list[str] | Yes | List of strings to join |
| delimiter | str | No | Delimiter to join with (default: ', ') |

**Returns:** str - Joined string

**Example:**
```python
str_lib = String()
result = str_lib.join(["one", "two", "three"])
# Returns "one, two, three"
result = str_lib.join(["a", "b", "c"], delimiter="|")
```

### replace
**Description:** Replace occurrences of a substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to modify |
| old | str | Yes | Substring to replace |
| new | str | Yes | Replacement string |
| count | int | No | Maximum replacements (-1 for all) |
| case_sensitive | bool | No | Whether replacement is case-sensitive |

**Returns:** str - Modified string

**Example:**
```python
str_lib = String()
result = str_lib.replace("Hello World", "World", "Universe")
result = str_lib.replace("hello HELLO Hello", "hello", "hi", count=1)
result = str_lib.replace("Hello HELLO", "hello", "hi", case_sensitive=False)
```

### trim
**Description:** Remove whitespace or specified characters from string.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to trim |
| chars | str \| None | No | Characters to remove (default: whitespace) |
| mode | str | No | Trim mode: 'both', 'start', or 'end' (default: 'both') |

**Returns:** str - Trimmed string

**Example:**
```python
str_lib = String()
result = str_lib.trim("  hello  ")
result = str_lib.trim("000hello000", chars="0")
result = str_lib.trim(" hello ", mode="start")
```

### format_string
**Description:** Format a string template with named placeholders.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| template | str | Yes | Template string with {placeholder} syntax |
| **kwargs | Any | No | Named values to substitute |

**Returns:** str - Formatted string

**Example:**
```python
str_lib = String()
result = str_lib.format_string("Hello {name}!", name="World")
result = str_lib.format_string("{greeting} {name}", greeting="Hello", name="User")
```

### length
**Description:** Get the length of a string.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to measure |

**Returns:** int - Length of the string

**Example:**
```python
str_lib = String()
len = str_lib.length("Hello")
```

### check_string
**Description:** Check if a string matches a condition.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to check |
| pattern | str | Yes | Pattern to match |
| check_type | str | No | Type of check: 'contains', 'starts_with', 'ends_with' |
| case_sensitive | bool | No | Whether comparison is case-sensitive |

**Returns:** bool - True if condition is met

**Example:**
```python
str_lib = String()
contains = str_lib.check_string("Hello World", "World", "contains")
starts = str_lib.check_string("Hello World", "Hello", "starts_with")
ends = str_lib.check_string("Hello World", "world", "ends_with", case_sensitive=False)
```

### change_case
**Description:** Convert string to a different case.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to convert |
| mode | str | No | Case mode: 'upper', 'lower', 'title', or 'capitalize' |

**Returns:** str - Converted string

**Example:**
```python
str_lib = String()
upper = str_lib.change_case("hello world", mode="upper")  # "HELLO WORLD"
lower = str_lib.change_case("HELLO WORLD", mode="lower")  # "hello world"
title = str_lib.change_case("hello world", mode="title")  # "Hello World"
capitalize = str_lib.change_case("hello world", mode="capitalize")  # "Hello world"
```

### regex_operation
**Description:** Perform a regex operation on a string.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to process |
| pattern | str | Yes | Regex pattern |
| operation | str | No | Operation: 'match', 'find_all', 'replace' |
| replacement | str | No | Replacement string (for replace) |
| flags | str | No | Regex flags: 'i' for ignore case, 'm' for multiline, 's' for dotall |
| count | int | No | Maximum replacements (for replace, 0 for all) |

**Returns:** list[str] \| str \| None - Result depends on operation type

**Example:**
```python
str_lib = String()
match = str_lib.regex_operation("Hello 123", r"\d+", operation="match")
# Returns ["123"]
all_matches = str_lib.regex_operation("a1 b2 c3", r"\d", operation="find_all")
# Returns ["1", "2", "3"]
replaced = str_lib.regex_operation("Hello 123", r"\d", operation="replace", replacement="#")
```

### substring
**Description:** Extract a substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | Source string |
| start | int | Yes | Start index (0-based, negative for from end) |
| length | int \| None | No | Length to extract (None for rest of string) |

**Returns:** str - Extracted substring

**Example:**
```python
str_lib = String()
sub = str_lib.substring("Hello World", 0, 5)  # "Hello"
sub = str_lib.substring("Hello World", -5)  # "World"
sub = str_lib.substring("Hello World", 6)  # "World"
```

### find_index
**Description:** Find the index of a substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to search in |
| substring | str | Yes | Substring to find |
| start | int | No | Start index for search (only for first direction) |
| case_sensitive | bool | No | Whether search is case-sensitive |
| direction | str | No | Search direction: 'first' or 'last' |

**Returns:** int - Index of substring, or -1 if not found

**Example:**
```python
str_lib = String()
idx = str_lib.find_index("Hello World", "o")  # Returns 4
idx = str_lib.find_index("Hello World", "o", direction="last")  # Returns 7
idx = str_lib.find_index("Hello World", "o", case_sensitive=False)
```

### pad
**Description:** Pad a string to a target length.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to pad |
| total_length | int | Yes | Target total length |
| pad_char | str | No | Character to pad with (default: ' ') |
| direction | str | No | Pad direction: 'left' or 'right' |

**Returns:** str - Padded string

**Example:**
```python
str_lib = String()
padded = str_lib.pad("5", total_length=3, pad_char="0")  # "005"
padded = str_lib.pad("left", total_length=8, pad_char=".", direction="right")  # "left...."
```

### repeat
**Description:** Repeat a string multiple times.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to repeat |
| count | int | Yes | Number of repetitions |

**Returns:** str - Repeated string

**Example:**
```python
str_lib = String()
result = str_lib.repeat("ha", 3)  # "hahahaha"
```

### is_empty
**Description:** Check if a string is empty.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to check |
| trim_whitespace | bool | No | Whether to trim before checking |

**Returns:** bool - True if string is empty

**Example:**
```python
str_lib = String()
empty = str_lib.is_empty("")
empty = str_lib.is_empty("   ")
empty = str_lib.is_empty("   ", trim_whitespace=True)
```

### reverse
**Description:** Reverse a string.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to reverse |

**Returns:** str - Reversed string

**Example:**
```python
str_lib = String()
reversed_str = str_lib.reverse("hello")  # "olleh"
```

### count_occurrences
**Description:** Count occurrences of a substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | String to search in |
| substring | str | Yes | Substring to count |
| case_sensitive | bool | No | Whether search is case-sensitive |

**Returns:** int - Number of occurrences

**Example:**
```python
str_lib = String()
count = str_lib.count_occurrences("Hello Hello hello", "hello", case_sensitive=False)
# Returns 3
```

### remove_duplicates
**Description:** Remove duplicate strings from a list.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| items | list[str] | Yes | List of strings |
| case_sensitive | bool | No | Whether comparison is case-sensitive |

**Returns:** list[str] - List with duplicates removed

**Example:**
```python
str_lib = String()
unique = str_lib.remove_duplicates(["a", "b", "a", "c", "B"], case_sensitive=False)
# Returns ["a", "b", "c"]
```

## Common Use Cases

- Parse and validate user input
- Format output strings and messages
- Process log files and text data
- Clean and normalize string data
- Extract information using regex
- Create human-readable reports
- String comparison and validation
- Text transformation for display
- Remove duplicate entries from lists
- Case-insensitive string operations
