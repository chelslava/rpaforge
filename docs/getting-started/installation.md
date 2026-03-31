# Installation

## System Requirements

- **Python**: 3.10 or higher
- **Node.js**: 18 or higher (for Studio UI)
- **OS**: Windows 10/11, Linux, macOS

## Installing Core Packages

### Using pip

```bash
# Core engine
pip install rpaforge-core

# RPA libraries
pip install rpaforge-libraries

# With optional dependencies
pip install rpaforge-libraries[desktop]  # Desktop UI automation
pip install rpaforge-libraries[web]      # Web UI automation
pip install rpaforge-libraries[ocr]      # OCR support
pip install rpaforge-libraries[all]      # All dependencies
```

### From Source

```bash
# Clone the repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode
pip install -e packages/core
pip install -e packages/libraries
```

## Installing Studio UI

The Studio UI is an Electron-based desktop application.

```bash
cd packages/studio
npm install
npm run dev
```

## Installing Playwright Browsers

For web automation, you need to install browser binaries:

```bash
pip install playwright
playwright install
```

## Verifying Installation

```python
# test_installation.py
from rpaforge import StudioEngine

engine = StudioEngine()
result = engine.run_string("""
*** Tasks ***
Test
    Log    RPAForge is working!
""")
print(f"Status: {result.suite.status}")
```

Run the test:

```bash
python test_installation.py
# Output: Status: PASS
```

## Troubleshooting

### pywinauto Installation Issues (Windows)

If you encounter issues installing pywinauto:

```bash
# Install Visual C++ Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

pip install pywinauto
```

### Playwright Browser Issues

```bash
# Install with dependencies
playwright install-deps

# Or for specific browser
playwright install chromium
```

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Create Your First Bot](first-bot.md)
