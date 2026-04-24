# RPAForge Libraries

[![PyPI version](https://badge.fury.io/py/rpaforge-libraries.svg)](https://badge.fury.io/py/rpaforge-libraries)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-libraries.svg)](https://pypi.org/project/rpaforge-libraries/)

RPA automation libraries for RPAForge.

## Included Libraries

| Library | Description | Status |
|---------|-------------|--------|
| `DesktopUI` | Windows desktop automation (Win32, WPF) | 🟡 In Progress |
| `WebUI` | Web automation with Playwright | 🟡 In Progress |
| `OCR` | Text recognition with Tesseract/EasyOCR | 🟡 In Progress |
| `Excel` | Excel file operations | 🟡 In Progress |
| `Database` | Database operations with SQLAlchemy | 🟡 In Progress |
| `Credentials` | Secure credential management | 🟡 In Progress |

## Installation

```bash
# Core libraries
pip install rpaforge-libraries

# With optional dependencies
pip install rpaforge-libraries[desktop]   # Desktop UI automation
pip install rpaforge-libraries[web]       # Web UI automation
pip install rpaforge-libraries[ocr]       # OCR support
pip install rpaforge-libraries[excel]     # Excel operations
pip install rpaforge-libraries[all]       # All dependencies
```

## Usage

### Desktop UI

```robot
*** Settings ***
Library    RPAForge.DesktopUI

*** Tasks ***
Automate Notepad
    Open Application    notepad.exe
    Wait For Window     Untitled - Notepad    timeout=10s
    Input Text    Hello from RPAForge!
    ${text}=    Get Window Text
    Log    ${text}
    Close Window
```

### Web UI

```robot
*** Settings ***
Library    RPAForge.WebUI

*** Tasks ***
Login Example
    Open Browser    https://example.com/login
    Input Text      id:username    myuser
    Input Text      id:password    mypass
    Click Button    id:login-btn
    Wait For Page Load
    Close Browser
```

### Excel

```robot
*** Settings ***
Library    RPAForge.Excel

*** Tasks ***
Process Invoice
    Open Workbook    invoice.xlsx
    ${data}=    Read Worksheet    Sheet1
    FOR    ${row}    IN    @{data}
        Log    Processing: ${row}[Customer]
    END
    Close Workbook
```

## License

Apache License 2.0
