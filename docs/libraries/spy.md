# Spy Library

## Overview

Spy is a global element picker library for Web (Chrome DevTools Protocol) and Desktop (Windows UI Automation). It enables real-time UI element identification and extraction of selectors for use in automation workflows.

## Installation

No additional dependencies required.

## Key Functions

### get_mouse_position
**Description:** Get current mouse position using Windows API.

**Returns:** tuple[int, int] - Current mouse coordinates (x, y)

**Example:**
```python
from rpaforge_libraries.Spy import get_mouse_position

x, y = get_mouse_position()
print(f"Mouse at: {x}, {y}")
```

### get_element_at_point_web
**Description:** Get element at coordinates via Chrome DevTools Protocol (CDP).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| x | int | Yes | X coordinate |
| y | int | Yes | Y coordinate |

**Returns:** dict[str, Any] \| None - Element information or None if not found

**Example:**
```python
from rpaforge_libraries.Spy import get_element_at_point_web

element = get_element_at_point_web(100, 200)
if element:
    print(f"Found: {element['tag']} {element['text'][:50]}")
```

**Requires:** Chrome with `--remote-debugging-port=9222`

### get_element_at_point_desktop
**Description:** Get element at coordinates via Windows UI Automation.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| x | int | Yes | X coordinate |
| y | int | Yes | Y coordinate |

**Returns:** dict[str, Any] \| None - Element information or None if not found

**Example:**
```python
from rpaforge_libraries.Spy import get_element_at_point_desktop

element = get_element_at_point_desktop(100, 200)
if element:
    print(f"Found: {element['tag']} - {element['text']}")
```

## Element Structure

All functions return a dictionary with the following structure:

```python
{
    "tag": "button",                    # Element tag/type
    "id": "submit-btn",                 # ID attribute if present
    "classes": ["btn", "primary"],      # Class names
    "text": "Submit Form",              # Text content
    "xpath": "/html/body/button[1]",    # XPath selector
    "cssPath": "button#submit-btn",     # CSS selector
    "reliableSelector": {               # Recommended selector
        "type": "id",
        "value": "id:submit-btn",
        "reliability": 1.0
    },
    "rect": {                           # Position and size
        "x": 100,
        "y": 200,
        "width": 120,
        "height": 40
    }
}
```

## Common Use Cases

- Identify UI elements for selector building
- Extract reliable selectors from interactive elements
- Cross-reference Web and Desktop element identification
- Debug selector paths in automation workflows
- Real-time element discovery during process design
- Verify element existence at specific screen coordinates
- Build selector libraries for repeated use
- Element comparison across different states

## Notes

- **Web Spy** requires Chrome to be running with remote debugging enabled: `chrome --remote-debugging-port=9222`
- **Desktop Spy** requires Windows with UI Automation support
- Both functions are blocking and may take a few seconds to return
- Elements found via Web require an active browser connection
- Desktop elements use the Windows UI Automation API
