# RPAForge

**Open Source RPA Studio built on Robot Framework**

RPAForge is a powerful, extensible RPA (Robotic Process Automation) studio that combines the reliability of Robot Framework with a modern visual interface. Design, record, debug, and orchestrate automation processes with ease.

## Features

- 🎨 **Visual Process Designer** - Drag-and-drop workflow builder with React Flow
- 🖥️ **Desktop Automation** - Win32, WPF, Java Swing support via pywinauto
- 🌐 **Web Automation** - Modern web automation with Playwright
- 📹 **Smart Recorder** - Record user actions and convert to automation scripts
- 🐛 **Integrated Debugger** - Breakpoints, step execution, variable inspection
- 📦 **Object Repository** - Centralized selector management with healing
- 🔌 **Plugin System** - Extend functionality with custom plugins
- 🏢 **Orchestrator** - Control tower for enterprise deployment (coming soon)

## Quick Start

### Prerequisites

- **Python 3.10+** (3.10, 3.11, 3.12, 3.13)
- **Node.js 20+** (20, 22)
- **npm 9+**
- **Git**
- **Make** (optional, for convenience commands)

### Installation

```bash
# Clone the repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Install Python packages
pip install -e packages/core
pip install -e packages/libraries

# Install Studio UI
cd packages/studio
npm ci --include=optional
npm run dev
```

**Note:** `--include=optional` ensures native bindings for Vite are installed correctly on all platforms.

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

```robot
*** Settings ***
Library    RPAForge.DesktopUI

*** Tasks ***
Open Notepad And Type
    Open Application    notepad.exe
    Wait For Window     Untitled - Notepad
    Type Text           Hello from RPAForge!
    Close Window
```

## Architecture

```
rpaforge/
├── packages/
│   ├── core/           # Python engine (Robot Framework wrapper)
│   ├── libraries/      # RPA libraries (DesktopUI, WebUI, OCR, etc.)
│   ├── studio/         # Electron + React UI
│   └── orchestrator/   # Control Tower backend
├── plugins/            # Example plugins
├── examples/           # Sample automation scripts
└── docs/               # Documentation
```

## Documentation

- [Getting Started](docs/getting-started/installation.md)
- [User Guide](docs/user-guide/designer.md)
- [Library Reference](docs/libraries/desktop-ui.md)
- [Developer Guide](docs/developer-guide/architecture.md)
- [API Reference](docs/api/)

## Roadmap

### v0.1.0 - MVP (Q2 2026)
- [x] Core engine wrapper
- [ ] Basic UI shell
- [ ] DesktopUI library
- [ ] Breakpoint debugging

### v0.2.0 - Visual Designer (Q3 2026)
- [ ] Drag-drop canvas
- [ ] Activity palette
- [ ] Property panel

### v0.3.0 - Recorder (Q4 2026)
- [ ] Desktop recording
- [ ] Web recording
- [ ] Selector extraction

### v1.0.0 - Production Ready (Q1 2027)
- [ ] Plugin system
- [ ] Orchestrator
- [ ] Enterprise features

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

## Project Structure

| Package | Description | Status |
|---------|-------------|--------|
| `rpaforge-core` | Core engine and debugger | 🟡 In Progress |
| `rpaforge-libraries` | RPA automation libraries | 🟡 In Progress |
| `rpaforge-studio` | Desktop UI application | 🔴 Planned |
| `rpaforge-orchestrator` | Control tower backend | 🔴 Planned |

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built on [Robot Framework](https://robotframework.org/)
- UI powered by [React Flow](https://reactflow.dev/) and [Electron](https://www.electronjs.org/)
- Inspired by UiPath, Blue Prism, and Automation Anywhere

## Community

- [GitHub Discussions](https://github.com/chelslava/rpaforge/discussions)
- [Issue Tracker](https://github.com/chelslava/rpaforge/issues)

---

**Made with ❤️ by the RPAForge Community**
