# Welcome to RPAForge

**Open Source RPA Studio - Visual automation builder**

RPAForge is a powerful, extensible RPA (Robotic Process Automation) studio with a modern visual interface.

## Why RPAForge?

| Feature | Description |
|---------|-------------|
| 🎨 **Visual Designer** | Drag-and-drop workflow builder - no coding required |
| 🖥️ **Desktop Automation** | Automate Windows applications (Win32, WPF, Java) |
| 🌐 **Web Automation** | Modern web automation with Playwright |
| 📹 **Smart Recorder** | Record your actions and convert to automation scripts |
| 🐛 **Integrated Debugger** | Breakpoints, step execution, variable inspection |
| 🔌 **Extensible** | Plugin system for custom functionality |

## Quick Start

### Installation

```bash
# Install RPAForge core and libraries
pip install rpaforge-core rpaforge-libraries
```

### Usage Example

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

# Create engine and register library
engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

# Create a process
builder = engine.create_process("Hello World")
builder.add_task("Notepad Automation", [
    ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text", {"text": "Hello from RPAForge!"}),
    ("DesktopUI.Close Window", {}),
])

# Run the process
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

### Using Studio UI

For a visual editor, use RPAForge Studio:

```bash
# Clone repository and install
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Install dependencies
pip install -e packages/core
pip install -e packages/libraries
cd packages/studio && pnpm install

# Run Studio in development mode
pnpm dev
```

## Features

### Visual Process Designer

Design automation workflows visually with a drag-and-drop interface. No coding experience required.

![Process Designer](assets/designer.png)

### Smart Recorder

Record your manual actions and RPAForge automatically converts them into reusable automation scripts.

### Integrated Debugger

Debug your automation processes with breakpoints, variable inspection, and step-by-step execution.

### Cross-Platform Libraries

- **DesktopUI**: Windows automation with pywinauto
- **WebUI**: Browser automation with Playwright
- **OCR**: Text recognition with Tesseract
- **Excel**: Spreadsheet automation
- **Database**: SQL operations

## License

RPAForge is released under the [Apache License 2.0](https://github.com/chelslava/rpaforge/blob/main/LICENSE).

## Sponsors

Consider sponsoring the project to support ongoing development.

[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/chelslava)
