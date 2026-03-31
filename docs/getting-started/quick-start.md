# Quick Start

This guide will help you create your first RPA automation with RPAForge in under 5 minutes.

## Your First Desktop Automation

Let's automate Windows Notepad:

```robot
*** Settings ***
Documentation     My first RPAForge automation
Library           RPAForge.DesktopUI

*** Tasks ***
Automate Notepad
    [Documentation]    Open Notepad and type some text
    
    # Start Notepad
    Open Application    notepad.exe
    
    # Wait for the window to appear
    Wait For Window    Notepad    timeout=10s
    
    # Type some text
    Input Text    ${None}    Hello from RPAForge!
    
    # Get the text and verify
    ${text}=    Get Window Text
    Should Contain    ${text}    Hello from RPAForge!
    
    # Clean up
    Close Window
    
    Log    Automation complete!
```

Save this as `my_first_bot.robot` and run:

```bash
robot my_first_bot.robot
```

## Your First Web Automation

Let's automate a web search:

```robot
*** Settings ***
Documentation     Web automation example
Library           RPAForge.WebUI

*** Tasks ***
Google Search
    [Documentation]    Perform a Google search
    
    # Open browser and navigate
    Open Browser    https://www.google.com
    
    # Accept cookies if prompted (varies by region)
    Run Keyword And Ignore Error    Click Element    id:L2AGLb
    
    # Type search query
    Input Text    name:q    RPAForge Robot Framework
    
    # Press Enter to search
    Press Keys    Enter
    
    # Wait for results
    Wait For Page Load
    
    # Get page title
    ${title}=    Get Page Title
    Log    Page title: ${title}
    
    # Take screenshot
    Take Screenshot    google_results.png
    
    # Close browser
    Close Browser
```

## Using Python API

You can also use RPAForge directly from Python:

```python
from rpaforge import StudioEngine

# Create engine
engine = StudioEngine()

# Build a process programmatically
builder = engine.create_process("My Process")
builder.add_task("Simple Task", [
    ("Log", ["Hello from Python API"]),
])

# Run it
result = engine.run(builder.build())
print(f"Status: {result.suite.status}")
```

## Next Steps

- Learn about the [Process Designer](../user-guide/designer.md)
- Explore the [Library Reference](../libraries/index.md)
- Read the [Developer Guide](../developer-guide/architecture.md)
