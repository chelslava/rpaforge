# RPAForge

**Open Source RPA Studio - Visual automation builder**

[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-core)](https://pypi.org/project/rpaforge-core/)

RPAForge is a modern, extensible RPA (Robotic Process Automation) studio with a powerful visual interface. Design, debug, and orchestrate automation processes with ease.

## Features

- 🎨 **Visual Process Designer** - Drag-and-drop workflow builder with React Flow
- 🖥️ **Desktop Automation** - Windows UI automation (Win32, WPF, Java) via pywinauto
- 🌐 **Web Automation** - Modern web automation with Playwright
- 🐛 **Integrated Debugger** - Breakpoints, step execution, variable inspection
- 📁 **File Operations** - Excel, CSV, and file manipulation
- 📊 **Database Integration** - SQLAlchemy-based database operations
- 🧠 **OCR Support** - Text recognition with Tesseract/EasyOCR
- 🔐 **Secure Credentials** - Encrypted credential management
- 🔌 **Plugin System** - Extend functionality with custom libraries

## Quick Start

### Prerequisites

- **Python**: 3.10, 3.11, 3.12, or 3.13
- **Node.js**: 20 or 22
- **npm**: 9+
- **Git**: For version control
- **Visual Studio Build Tools** (Windows, for native modules)

### Installation

```bash
# Clone the repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Install development dependencies
pip install -r requirements-dev.txt
pre-commit install

# Install Python packages in development mode
pip install -e packages/core
pip install -e packages/libraries

# Install Studio UI
cd packages/studio
npm ci --include=optional

# Run tests to verify installation
cd ../..
pytest packages/core/tests -v
cd packages/studio && npm test && cd ../..

### System Dependencies

**Windows:**
- Python 3.10+
- Visual Studio Build Tools (for native modules)

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`
- Python 3.10+

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1

# Fedora
sudo dnf install -y nss nspr atk at-spi2-atk libdrm libxkbcommon libgbm

# Arch
sudo pacman -S nss nspr atk at-spi2-atk libdrm libxkbcommon libgbm
```

### Your First Bot

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

## Architecture

```
rpaforge/
├── packages/
│   ├── core/              # Python core engine (executor, debugger, bridge)
│   ├── libraries/         # RPA automation libraries (DesktopUI, WebUI, OCR, etc.)
│   ├── studio/            # Electron + React UI (designer, debugger, recorder)
│   └── orchestrator/      # Control Tower (future)
├── docs/                  # Documentation (MKDocs)
├── .github/               # GitHub workflows and templates
└── tools/                 # Development tools
```

## Documentation

- [Getting Started](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Architecture](docs/wiki/Architecture.md)
- [Activity Types & SDK](docs/wiki/Activity-Types-and-SDK.md)
- [Developer Guide](docs/wiki/Home.md)
- [Contribution Guidelines](CONTRIBUTING.md)

## Roadmap

### v0.2.0 - Current Release (Q2 2026)
- ✅ Core engine with debugging
- ✅ IPC bridge for Electron-Python communication
- ✅ DesktopUI library (pywinauto)
- ✅ WebUI library (Playwright)
- ✅ File operations (Excel, CSV, file management)
- ✅ Database integration (SQLAlchemy)
- ✅ OCR support (Tesseract, EasyOCR)
- ✅ Secure credentials management
- ✅ Visual process designer (Electron + React)
- ✅ Integrated debugger UI
- ✅ Python bridge server
- ✅ State management (Zustand)
- ✅ Code generation to Python

### v0.3.0 - Enhanced Features (Q3 2026)
- [ ] Smart activity recorder
- [ ] Selector extraction and healing
- [ ] Sub-diagram support
- [ ] Variable explorer
- [ ] Execution history

### v0.4.0 - Advanced Features (Q4 2026)
- [ ] Plugin system
- [ ] Library development SDK
- [ ] Project templates
- [ ] Version control integration

### v1.0.0 - Production Ready (Q1 2027)
- [ ] Orchestrator (control tower)
- [ ] Enterprise features
- [ ] Advanced debugging
- [ ] Performance optimizations

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install development dependencies
pip install -r requirements-dev.txt
pre-commit install

# Run tests
make test

# Run linting
make lint

# Build documentation
make docs
```

## Project Status

| Package | Description | Status | Version |
|---------|-------------|--------|---------|
| `rpaforge-core` | Core engine, debugger, bridge server | ✅ Stable | v0.2.0.dev1 |
| `rpaforge-libraries` | RPA automation libraries (DesktopUI, WebUI, OCR, etc.) | ✅ Stable | v0.2.0.dev1 |
| `rpaforge-studio` | Desktop UI (Electron + React) | ✅ Alpha | v0.1.0-dev.1 |
| `rpaforge-orchestrator` | Control Tower backend | 🔜 Planned | - |

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- UI powered by [React Flow](https://reactflow.dev/) and [Electron](https://www.electronjs.org/)
- Desktop automation via [pywinauto](https://pywinauto.readthedocs.io/)
- Web automation via [Playwright](https://playwright.dev/)
- Inspired by UiPath, Blue Prism, and Automation Anywhere

## Community

- [GitHub Discussions](https://github.com/chelslava/rpaforge/discussions)
- [Issue Tracker](https://github.com/chelslava/rpaforge/issues)

---

**Made with ❤️ by the RPAForge Community**
