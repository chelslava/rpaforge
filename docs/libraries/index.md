# RPAForge Libraries

## Overview

RPAForge provides 14 specialized libraries covering all aspects of robotic process automation. Each library delivers targeted functionality with consistent APIs for building robust automation workflows.

## Library Reference

| Library | Keywords | Description |
|---------|----------|-------------|
| [DesktopUI](desktopui.md) | 58 | Windows desktop automation using pywinauto |
| [WebUI](webui.md) | 60 | Browser automation using Playwright |
| [Excel](excel.md) | 34 | Excel file operations using openpyxl |
| [DataFrames](dataframes.md) | 28 | Tabular data operations using Polars |
| [Database](database.md) | 19 | Database operations using SQLAlchemy |
| [File](file.md) | 18 | File system operations |
| [HTTP](http.md) | 14 | HTTP/API operations using requests |
| [OCR](ocr.md) | 12 | Text recognition using Tesseract |
| [Credentials](credentials.md) | 14 | Secure credential management |
| [DateTime](datetime.md) | 16 | Date and time operations |
| [String](string.md) | 19 | String manipulation operations |
| [Variables](variables.md) | 19 | Variable management and scoping |
| [Flow](flow.md) | 8 | Flow control operations |
| [Spy](spy.md) | 3 | Live UI element inspector |

## Installation

```bash
pip install rpaforge-libraries

# Optional dependencies
pip install rpaforge-libraries[desktop]    # DesktopUI (pywinauto)
pip install rpaforge-libraries[web]         # WebUI (playwright)
pip install rpaforge-libraries[ocr]         # OCR (tesseract)
pip install rpaforge-libraries[excel]       # Excel (openpyxl)
pip install rpaforge-libraries[dataframes]  # DataFrames (polars)
pip install rpaforge-libraries[database]    # Database (sqlalchemy)
pip install rpaforge-libraries[all]         # All dependencies
```

## Usage Example

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI
from rpaforge_libraries.Excel import Excel

engine = StudioEngine()
builder = engine.create_process("My Automation")
builder.add_task("My Task", [
    ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
    (" Excel.Read Cell", {"cell": "A1"}),
])

result = engine.run(builder.build())
```

## Supported Keywords by Category

### Desktop
- DesktopUI: 27 keywords

### Web
- WebUI: 21 keywords

### Data
- Excel: 17 keywords
- DataFrames: 28 keywords
- Database: 13 keywords
- DateTime: 16 keywords
- String: 15 keywords
- Variables: 19 keywords

### System
- File: 18 keywords
- Flow: 7 keywords
- Credentials: 14 keywords

### Advanced
- OCR: 12 keywords
- HTTP: 14 keywords
