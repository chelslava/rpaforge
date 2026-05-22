# DesktopUI Library

## Overview

DesktopUI is a Windows desktop automation library using pywinauto with multi-application and multi-window support. It enables automating Win32, WPF, and Java desktop applications through programmatic UI interaction.

## Installation

```bash
pip install rpaforge-libraries[desktop]
```

## Keywords

### open_application
**Description:** Launch a new application process.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| executable | str \| Path | Yes | Path to the executable file |
| args | str | No | Command line arguments to pass |
| app_id | str \| None | No | Custom identifier for the app instance |
| _timeout | str | No | Timeout string (e.g., "30s") |

**Returns:** str - Application instance ID

**Example:**
```python
ui = DesktopUI()
app_id = ui.open_application("notepad.exe")
app_id = ui.open_application("C:\\Program Files\\Chrome\\chrome.exe", args="--new-window")
```

### connect_to_application
**Description:** Attach to a running application by process ID or window title.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| process_id | int \| None | No | Process ID of the application |
| window_title | str \| None | No | Window title to match |
| app_id | str \| None | No | Custom identifier for the app instance |

**Returns:** str - Application instance ID

**Example:**
```python
ui = DesktopUI()
app_id = ui.connect_to_application(process_id=1234)
app_id = ui.connect_to_application(window_title="Notepad")
```

### switch_application
**Description:** Switch the active application context.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| app_id | str | Yes | Application ID to switch to |

**Returns:** str - Current application ID

**Example:**
```python
ui = DesktopUI()
app_id = ui.switch_application("app_abc123")
```

### list_applications
**Description:** List all connected application instances.

**Returns:** list[str] - List of application instance IDs

**Example:**
```python
ui = DesktopUI()
apps = ui.list_applications()
```

### list_windows
**Description:** List all tracked window instances.

**Returns:** list[str] - List of window instance IDs

**Example:**
```python
ui = DesktopUI()
windows = ui.list_windows()
```

### get_current_application
**Description:** Get the currently active application ID.

**Returns:** str - Current application ID

**Example:**
```python
ui = DesktopUI()
current = ui.get_current_application()
```

### get_current_window
**Description:** Get the currently active window ID.

**Returns:** str - Current window ID

**Example:**
```python
ui = DesktopUI()
current = ui.get_current_window()
```

### wait_for_window
**Description:** Wait for a window with the given title to appear.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | str | Yes | Window title to wait for |
| timeout | str | No | Maximum wait time (default: "30s") |
| exact | bool | No | Match exact title (default: False) |
| window_id | str \| None | No | Custom window identifier |

**Returns:** str - Window instance ID

**Example:**
```python
ui = DesktopUI()
ui.open_application("notepad.exe")
win_id = ui.wait_for_window("Notepad", timeout="10s")
```

### switch_window
**Description:** Switch to a specific window by ID, title, or index.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| window_id | str \| None | No | Window ID |
| title | str \| None | No | Window title |
| index | int \| None | No | Window index in the application |

**Returns:** str - Current window ID

**Example:**
```python
ui = DesktopUI()
ui.wait_for_window("Notepad")
ui.switch_window(title="Save As")
```

### click_element
**Description:** Click a UI element using a selector.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.click_element("id:OKButton")
ui.click_element("name:Cancel")
```

### double_click_element
**Description:** Double-click a UI element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.double_click_element("id:OpenButton")
```

### input_text
**Description:** Input text into a field or send keystrokes globally.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str \| None | No | Element selector (None for global keystrokes) |
| text | str | Yes | Text to input |
| clear | bool | No | Clear field first (default: True) |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.input_text("id:TextBox", "Hello World")
ui.input_text(None, "Global keystrokes")
```

### press_keys
**Description:** Send keystrokes directly.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| keys | str | Yes | Key sequence (e.g., "{ENTER}", "^s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.press_keys("{ENTER}")
ui.press_keys("^s")  #Ctrl+S
```

### get_element_text
**Description:** Get the visible text of an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** str - Element text content

**Example:**
```python
ui = DesktopUI()
text = ui.get_element_text("id:StatusText")
```

### get_window_text
**Description:** Get the title text of the current window.

**Returns:** str - Window text content

**Example:**
```python
ui = DesktopUI()
title = ui.get_window_text()
```

### wait_until_element_exists
**Description:** Wait until an element exists in the UI tree.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.wait_until_element_exists("id:CancelButton")
```

### wait_until_element_visible
**Description:** Wait until an element is visible on screen.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.wait_until_element_visible("id:DialogBox")
```

### close_window
**Description:** Close a window by ID or title.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| window_id | str \| None | No | Window ID |
| title | str \| None | No | Window title |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.close_window()
ui.close_window(title="Save As")
```

### close_application
**Description:** Close an application instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| app_id | str \| None | No | Application ID (current if None) |
| all | bool | No | Close all applications |

**Returns:** list[str] - Remaining application IDs

**Example:**
```python
ui = DesktopUI()
remaining = ui.close_application()
ui.close_application(all=True)
```

### right_click_element
**Description:** Right-click a UI element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.right_click_element("id:ListViewItem")
```

### mouse_hover
**Description:** Hover the mouse over an element without clicking.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.mouse_hover("id:MenuItem")
```

### drag_and_drop
**Description:** Drag a source element and drop it on a target element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| source | str | Yes | Source element selector |
| target | str | Yes | Target element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.drag_and_drop("id:DragSource", "id:DropTarget")
```

### scroll_element
**Description:** Scroll inside an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| direction | str | No | Scroll direction: 'up' or 'down' (default: 'down') |
| amount | int | No | Number of scroll wheel clicks (default: 3) |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.scroll_element("id:ScrollableArea", direction="up", amount=5)
```

### maximize_window
**Description:** Maximize the current or specified window.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| window_id | str \| None | No | Window ID (current if None) |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.maximize_window()
```

### minimize_window
**Description:** Minimize the current or specified window.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| window_id | str \| None | No | Window ID (current if None) |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.minimize_window()
```

### attach_by_pid
**Description:** Attach to a running application by its process ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| pid | int | Yes | Process ID of the target application |
| app_id | str \| None | No | Optional ID to assign |

**Returns:** str - Application ID

**Example:**
```python
ui = DesktopUI()
app_id = ui.attach_by_pid(12345)
```

### wait_until_window_closed
**Description:** Wait until a window with the given title disappears.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | str | Yes | Window title (partial match) |
| timeout | str | No | Maximum wait time (default: "30s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.wait_until_window_closed("Progress", timeout="60s")
```

### take_screenshot
**Description:** Take a screenshot of the current window.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | str | No | Output filename (default: "screenshot.png") |

**Returns:** str - Filename of the saved screenshot

**Example:**
```python
ui = DesktopUI()
filename = ui.take_screenshot("window_capture.png")
```

### set_screenshot_on_failure
**Description:** Configure automatic screenshot capture on failures.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| enabled | bool | No | Enable/disable feature (default: True) |
| directory | str | No | Directory for saving screenshots (default: ".") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.set_screenshot_on_failure(enabled=True, directory="./screenshots")
```

### validate_selector
**Description:** Validate if a selector can find a matching element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "5s") |

**Returns:** dict[str, Any] - Dictionary with validation results including valid, found, visible, enabled

**Example:**
```python
ui = DesktopUI()
result = ui.validate_selector("id:OKButton")
if result["found"]:
    print("Element found and visible:", result["visible"])
```

### get_element_attribute
**Description:** Get a specific attribute from an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| attribute | str | Yes | Attribute name (text, class, id, rectangle, etc.) |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** str - Attribute value

**Example:**
```python
ui = DesktopUI()
text = ui.get_element_attribute("id:TextBox", "text")
enabled = ui.get_element_attribute("id:OKButton", "enabled")
```

### wait_until_element_contains_text
**Description:** Wait until an element's text contains the specified substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| text | str | Yes | Text to search for |
| timeout | str | No | Wait timeout (default: "30s") |
| case_sensitive | bool | No | Case-sensitive search (default: False) |

**Returns:** bool - True when element contains text

**Example:**
```python
ui = DesktopUI()
ui.wait_until_element_contains_text("id:Status", "Completed", timeout="60s")
```

### get_element_properties
**Description:** Get a dictionary of element properties.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** dict[str, Any] - Dictionary with element properties

**Example:**
```python
ui = DesktopUI()
props = ui.get_element_properties("id:CheckBox")
print("Visible:", props["is_visible"])
print("Enabled:", props["is_enabled"])
```

### inspect_window
**Description:** Get all interactive elements in the current window for selector building.

**Returns:** dict[str, Any] - Dictionary with elements list and total count

**Example:**
```python
ui = DesktopUI()
ui.wait_for_window("Notepad")
inspection = ui.inspect_window()
for elem in inspection["elements"]:
    print(f"Found: {elem['tag']} - {elem['text']}")
```

### test_desktop_selector
**Description:** Test a desktop selector and return validation results.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "2s") |

**Returns:** dict[str, Any] - Selector test result with valid, unique, count, visible, enabled

**Example:**
```python
ui = DesktopUI()
result = ui.test_desktop_selector("id:OKButton")
if result["unique"]:
    print("Selector is unique and found")
```

### highlight_desktop_element
**Description:** Draw a temporary red outline around a matched element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "2s") |

**Returns:** None

**Example:**
```python
ui = DesktopUI()
ui.highlight_desktop_element("id:CancelButton")
```

## Common Use Cases

- Launch and interact with desktop applications
- Automate form filling in native Windows applications
- Test desktop application UIs programmatically
- Create unattended automation scripts for batch processing
- Integrate desktop workflows with web and cloud services
