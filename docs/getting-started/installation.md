# Installation

## System Requirements

- **Python**: 3.10 or higher
- **Node.js**: 20 or higher (for Studio UI)
- **pnpm**: 9 or higher (Node package manager)
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
pnpm install
pnpm dev
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
builder = engine.create_process("Test Process")
builder.add_task("Test", [
    ("Log", ["RPAForge is working!"]),
])
result = engine.run(builder.build())
print(f"Status: {result.status}")
```

Run the test:

```bash
python test_installation.py
# Output: Status: pass
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
# Install Playwright and browser binaries
playwright install

# Supported browsers: chromium, firefox, webkit
playwright install chromium
```

### Node.js / pnpm Issues

If you encounter issues with pnpm or Node modules:

```bash
# Clear pnpm cache
pnpm store prune

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Platform-Specific Installation

### Windows

**Additional Requirements:**
- Visual Studio Build Tools (for native Python modules)
  [Download here](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

**Installation Steps:**
```powershell
# Clone repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt
pip install -e packages/core
pip install -e packages/libraries

# Install Studio dependencies
cd packages/studio
pnpm install

# Start Studio
pnpm dev
```

**PowerShell Tips:**
- Use `python` instead of `python3`
- Use backslash `\` for path separators in commands
- Run PowerShell as Administrator if you encounter permission issues

### macOS

**Additional Requirements:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python and Node.js via Homebrew
brew install python@3.12 node
```

**Installation Steps:**
```bash
# Clone repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
pip install -e packages/core
pip install -e packages/libraries

# Install Studio dependencies
cd packages/studio
pnpm install

# Start Studio
pnpm dev
```

**Apple Silicon (M1/M2/M3) Notes:**
- Some native modules may require compilation
- Ensure Xcode Command Line Tools is fully installed
- If build issues occur, try: `sudo xcode-select --reset`

### Linux (Ubuntu/Debian)

**System Dependencies:**
```bash
# Update package manager
sudo apt-get update

# Install required packages
sudo apt-get install -y \
  python3.12 python3.12-venv python3.12-dev \
  nodejs npm \
  build-essential \
  git

# Install pnpm globally
npm install -g pnpm
```

**Installation Steps:**
```bash
# Clone repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
pip install -e packages/core
pip install -e packages/libraries

# Install Studio dependencies
cd packages/studio
pnpm install

# Start Studio
pnpm dev
```

### Linux (Fedora/RHEL)

**System Dependencies:**
```bash
# Install required packages
sudo dnf install -y \
  python3.12 python3.12-devel \
  nodejs npm \
  gcc g++ make \
  git

# Install pnpm globally
npm install -g pnpm
```

**Installation Steps:**
Same as Ubuntu/Debian above, using `python3.12` and `dnf` instead of `apt-get`.

## Verifying Installation

After installation, verify everything works:

```python
# Create test_setup.py
from rpaforge import StudioEngine

engine = StudioEngine()
builder = engine.create_process("Test")
builder.add_task("Test Task", [])
result = engine.run(builder.build())
print(f"✓ RPAForge Core: {result.status}")
```

```bash
# Run the test
python test_setup.py

# Should output: ✓ RPAForge Core: pass
```

For Studio UI, if `pnpm dev` opens a browser window at `http://localhost:5173`, installation is successful.
playwright install-deps

# Or for specific browser
playwright install chromium
```

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Create Your First Bot](first-bot.md)
