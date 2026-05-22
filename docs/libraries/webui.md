# WebUI Library

## Overview

WebUI is a web automation library using Playwright with multi-browser and multi-window support. It enables automating modern web applications across Chrome, Firefox, and WebKit browsers with robust element selectors and debugging capabilities.

## Installation

```bash
pip install rpaforge-libraries[web]
playwright install  # Downloads browser binaries
```

## Keywords

### open_browser
**Description:** Launch a new browser instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str \| None | No | URL to navigate to on startup |
| browser | str | No | Browser type: chromium, firefox, webkit (default: chromium) |
| headless | bool | No | Run in headless mode (default: False) |
| browser_id | str \| None | No | Custom browser identifier |

**Returns:** str - Browser instance ID

**Example:**
```python
web = WebUI()
browser_id = web.open_browser("https://example.com", browser="chromium")
browser_id = web.open_browser(headless=True)  # For CI/CD
```

### new_page
**Description:** Create a new page (tab) in the current browser context.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str \| None | No | URL to navigate to |
| page_id | str \| None | No | Custom page identifier |

**Returns:** str - Page ID

**Example:**
```python
web = WebUI()
web.open_browser()
page_id = web.new_page("https://example.com/login")
```

### switch_browser
**Description:** Switch the active browser context.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| browser_id | str | Yes | Browser ID to switch to |

**Returns:** str - Current browser ID

**Example:**
```python
web = WebUI()
web.open_browser(browser_id="browser1")
web.open_browser(browser_id="browser2")
web.switch_browser("browser1")
```

### switch_page
**Description:** Switch the active page (tab).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| page_id | str | Yes | Page ID to switch to |

**Returns:** str - Current page ID

**Example:**
```python
web = WebUI()
web.open_browser()
page1 = web.new_page()
page2 = web.new_page()
web.switch_page(page2)
```

### list_browsers
**Description:** List all open browser instances.

**Returns:** list[str] - List of browser instance IDs

**Example:**
```python
web = WebUI()
browsers = web.list_browsers()
```

### list_pages
**Description:** List all open pages.

**Returns:** list[str] - List of page instance IDs

**Example:**
```python
web = WebUI()
pages = web.list_pages()
```

### get_current_browser
**Description:** Get the currently active browser ID.

**Returns:** str - Current browser ID

**Example:**
```python
web = WebUI()
current = web.get_current_browser()
```

### get_current_page
**Description:** Get the currently active page ID.

**Returns:** str - Current page ID

**Example:**
```python
web = WebUI()
current = web.get_current_page()
```

### navigate
**Description:** Perform browser navigation actions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | str | No | URL for navigation (used with action='url') |
| action | str | No | Navigation action: url, back, forward, refresh (default: 'url') |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.navigate(url="https://example.com")
web.navigate(action="back")
web.navigate(action="refresh")
```

### click_element
**Description:** Click an element with configurable click type.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector (CSS or XPath) |
| timeout | str | No | Wait timeout (default: "30s") |
| click_type | str | No | Click type: single, double, right (default: 'single') |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.click_element("button#submit")
web.click_element("a.link", click_type="right")
web.click_element("//button[@type='submit']", click_type="double")
```

### input_text
**Description:** Input text into a field.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| text | str | Yes | Text to input |
| clear | bool | No | Clear field first (default: True) |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.input_text("input#username", "myuser")
web.input_text("input#password", "mypass", clear=True)
```

### press_keys
**Description:** Press键盘 keys.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| keys | str | Yes | Key sequence (e.g., "Enter", "Escape", "Control+c") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.press_keys("Enter")
web.press_keys("Control+v")
```

### select_option
**Description:** Select an option from a dropdown.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Select element selector |
| value | str \| list[str] | Yes | Option value(s) to select |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.select_option("select#country", "US")
web.select_option("select#state", ["CA", "NY"])
```

### set_checkbox
**Description:** Check or uncheck a checkbox.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Checkbox element selector |
| checked | bool | No | Check state (default: True) |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.set_checkbox("input#accept", checked=True)
web.set_checkbox("input#remember", checked=False)
```

### get_element_text
**Description:** Get visible text of an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** str - Element text content

**Example:**
```python
web = WebUI()
web.open_browser()
text = web.get_element_text("h1.title")
```

### get_element_attribute
**Description:** Get an attribute value from an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| attribute | str | Yes | Attribute name |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** str - Attribute value

**Example:**
```python
web = WebUI()
web.open_browser()
href = web.get_element_attribute("a.link", "href")
disabled = web.get_element_attribute("input", "disabled")
```

### get_page_title
**Description:** Get the page title.

**Returns:** str - Page title

**Example:**
```python
web = WebUI()
web.open_browser()
title = web.get_page_title()
```

### get_url
**Description:** Get the current page URL.

**Returns:** str - Current URL

**Example:**
```python
web = WebUI()
web.open_browser()
url = web.get_url()
```

### wait_for_page_load
**Description:** Wait until the page is fully loaded.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.click_element("button.submit")
web.wait_for_page_load()
```

### wait_for_element
**Description:** Wait for an element to reach a specific state.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| state | str | No | Expected state: visible, hidden, attached, detached (default: 'visible') |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.wait_for_element("div.modal", state="visible")
web.wait_for_element("div.loading", state="hidden")
```

### wait_for_selector
**Description:** Wait for an element to be attached to the DOM.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.wait_for_selector("form#login")
```

### take_screenshot
**Description:** Take a screenshot of the page.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | str | No | Output filename (default: "screenshot.png") |
| full_page | bool | No | Capture entire page (default: False) |

**Returns:** str - Filename of the saved screenshot

**Example:**
```python
web = WebUI()
web.open_browser()
filename = web.take_screenshot("page.png")
filename = web.take_screenshot("full.png", full_page=True)
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
web = WebUI()
web.set_screenshot_on_failure(enabled=True, directory="./screenshots")
```

### validate_selector
**Description:** Validate if a selector finds a matching element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "5s") |

**Returns:** dict[str, Any] - Dictionary with valid, found, visible, enabled, text

**Example:**
```python
web = WebUI()
result = web.validate_selector("button#submit")
if result["found"]:
    print("Element found:", result["text"][:50])
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
web = WebUI()
web.open_browser()
web.wait_until_element_contains_text("div.status", "Success", timeout="60s")
```

### handle_dialog
**Description:** Set up dialog handler for alerts, confirms, and prompts.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| action | str | No | Action: accept or dismiss (default: 'accept') |
| prompt_text | str | No | Text for prompt dialogs |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.handle_dialog(action="accept")
web.click_element("button.alert")
```

### upload_file
**Description:** Upload a file to a file input element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | File input element selector |
| file_path | str | Yes | Path to the file to upload |
| timeout | str | No | Wait timeout (default: "30s") |

**Returns:** None

**Example:**
```python
web = WebUI()
web.open_browser()
web.upload_file("input#upload", "/path/to/file.txt")
```

### download_file
**Description:** Download a file by clicking a link.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector that triggers download |
| save_path | str | Yes | Path to save the downloaded file |
| timeout | str | No | Wait timeout (default: "60s") |

**Returns:** str - Path where file was saved

**Example:**
```python
web = WebUI()
web.open_browser()
save_path = web.download_file("a#download-btn", "./downloads/report.pdf")
```

### get_element_properties
**Description:** Get detailed properties of an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| timeout | str | No | Wait timeout (default: "10s") |

**Returns:** dict[str, Any] - Dictionary with text, inner_text, tag_name, is_visible, is_enabled, is_checked, value

**Example:**
```python
web = WebUI()
props = web.get_element_properties("input#email")
print("Is checked:", props["is_checked"])
print("Input value:", props["value"])
```

### inspect_page
**Description:** Get all interactive elements on the page for selector building.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| _include_frames | bool | No | Include iframe contents (default: True) |

**Returns:** dict[str, Any] - Dictionary with elements list, total count, and url

**Example:**
```python
web = WebUI()
web.open_browser()
inspection = web.inspect_page()
for elem in inspection["elements"]:
    print(f"Found: {elem['tag']} - {elem['text']}")
```

### highlight_element
**Description:** Draw a temporary outline around a matched element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |
| color | str | No | Outline color (default: 'yellow') |
| duration | int | No | Duration in milliseconds (default: 3000) |

**Returns:** None

**Example:**
```python
web = WebUI()
web.highlight_element("button#submit", color="red", duration=2000)
```

### test_selector
**Description:** Test a selector and return validation results.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| selector | str | Yes | Element selector |

**Returns:** dict[str, Any] - Selector test result with valid, unique, count, visible, enabled, warning

**Example:**
```python
web = WebUI()
result = web.test_selector("button#submit")
if result["unique"]:
    print("Selector is unique")
elif result["warning"]:
    print(result["warning"])
```

### get_xpath_from_point
**Description:** Get the element at screen coordinates via XPath and CSS.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| x | int | Yes | X coordinate |
| y | int | Yes | Y coordinate |

**Returns:** dict[str, str] - Dictionary with xpath, css, tag, text

**Example:**
```python
web = WebUI()
el = web.get_xpath_from_point(100, 200)
print("Element at 100,200:", el["tag"], el["text"])
```

### close_page
**Description:** Close a page.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| page_id | str \| None | No | Page ID to close (current if None) |

**Returns:** None

**Example:**
```python
web = WebUI()
web.close_page()
```

### close_browser
**Description:** Close a browser or all browsers.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| browser_id | str \| None | No | Browser ID to close (current if None) |
| all | bool | No | Close all browsers |

**Returns:** list[str] - Remaining browser IDs

**Example:**
```python
web = WebUI()
web.close_browser()
web.close_browser(all=True)
```

## Common Use Cases

- Automate web form submissions
- Web scraping with JavaScript execution
- Browser-based testing and validation
- Cross-browser compatibility testing
- Screenshot capture for documentation
- File downloads and uploads
- Modal dialog handling
- Page navigation and state validation
