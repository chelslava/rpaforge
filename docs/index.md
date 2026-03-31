# Welcome to RPAForge

**Open Source RPA Studio built on Robot Framework**

RPAForge is a powerful, extensible RPA (Robotic Process Automation) studio that combines the reliability of Robot Framework with a modern visual interface.

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

```bash
# Install RPAForge
pip install rpaforge-core rpaforge-libraries

# Install studio UI (coming soon)
npm install -g rpaforge-studio
```

```robot
*** Settings ***
Library    RPAForge.DesktopUI

*** Tasks ***
Hello World
    Open Application    notepad.exe
    Wait For Window     Notepad
    Input Text          ${None}    Hello from RPAForge!
    Close Window
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
