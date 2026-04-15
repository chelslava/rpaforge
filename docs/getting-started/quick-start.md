# Quick Start

This guide will help you create your first RPA automation with RPAForge in under 5 minutes.

## Your First Desktop Automation

Let's automate Windows Notepad using Python:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

# Create engine and register library
engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

# Build a process
builder = engine.create_process("Notepad Automation")
builder.add_task("Open and Type", [
    ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text", {"selector": None, "text": "Hello from RPAForge!"}),
    ("DesktopUI.Close Window", {}),
])

# Run it
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

Save this as `notepad_bot.py` and run:

```bash
python notepad_bot.py
```

## Your First Web Automation

Let's automate a web search:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.WebUI import WebUI

# Create engine and register library
engine = StudioEngine()
engine.executor.register_library("WebUI", WebUI())

# Build a process
builder = engine.create_process("Web Search")
builder.add_task("Google Search", [
    ("WebUI.Open Browser", {"url": "https://www.google.com"}),
    ("WebUI.Input Text", {"selector": "name:q", "text": "RPAForge Python RPA"}),
    ("WebUI.Press Keys", {"keys": "Enter"}),
    ("WebUI.Wait For Page Load", {}),
    ("WebUI.Take Screenshot", {"filename": "results.png"}),
    ("WebUI.Close Browser", {}),
])

# Run it
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

## Using the Python API Directly

You can also execute activities directly:

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
desktop = DesktopUI()
engine.executor.register_library("DesktopUI", desktop)

# Open application directly
process_id = desktop.open_application("notepad.exe")
print(f"Started process: {process_id}")

# Wait for window
desktop.wait_for_window("Notepad", timeout="10s")

# Type text
desktop.input_text(None, "Hello World!")

# Close
desktop.close_window()
```

## Using the Studio UI

The visual designer provides a drag-and-drop interface:

```bash
cd packages/studio
npm install
npm run dev
```

Then:
1. Drag activities from the palette to the canvas
2. Connect them to create a workflow
3. Configure parameters in the property panel
4. Click Run to execute

## Next Steps

- Learn about the [Process Designer](../user-guide/designer.md)
- Explore the [Library Reference](../libraries/index.md)
- Read the [Developer Guide](../developer-guide/architecture.md)
