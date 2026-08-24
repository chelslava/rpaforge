<div align="center">

![RPAForge Logo](docs/assets/logo.png)

**Robotic Process Automation Studio**

[![CI](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml/badge.svg)](https://github.com/chelslava/rpaforge/actions/workflows/ci.yml)
[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![Python](https://img.shields.io/pypi/pyversions/rpaforge-core)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)
[![codecov](https://codecov.io/gh/chelslava/rpaforge/branch/main/graph/badge.svg)](https://codecov.io/gh/chelslava/rpaforge)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Download](#download) · [Getting Started](#quick-start) · [Documentation](#documentation) · [Libraries](#rpa-libraries) · [Roadmap](#roadmap) · [Contributing](#contributing)

[🇷🇺 Русский](README.ru.md) · [🇩🇪 Deutsch](README.de.md) · [🇪🇸 Español](README.es.md)

</div>

---

RPAForge is a modern, open-source **Robotic Process Automation** studio. Design automation workflows visually, debug them step by step, and execute them with a production-grade Python engine — no vendor lock-in, no license fees.

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

builder = engine.create_process("Notepad Automation")
builder.add_task("Open and Type", [
    ("DesktopUI.Open Application",  {"executable": "notepad.exe"}),
    ("DesktopUI.Wait For Window",   {"title": "Notepad", "timeout": "10s"}),
    ("DesktopUI.Input Text",        {"text": "Hello from RPAForge!"}),
    ("DesktopUI.Close Window",      {}),
])

result = engine.run(builder.build())
print(f"Status: {result.status}")
```

---

## Download

**Just want to use RPAForge?** Grab the latest Windows installer from the
[Releases page](https://github.com/chelslava/rpaforge/releases). The installer
bundles the Python engine, so **no separate Python installation is required** —
install, launch, and start building automations.

To build from source instead, see the [Quick Start](#quick-start) below.

---

## Features

| | |
|---|---|
| **Visual Designer** | Drag-and-drop workflow builder powered by React Flow — nodes, edges, sub-diagrams, zoom/pan, and a mini-map |
| **AI Diagram Generation** | Describe a process in plain language and get a draft diagram — OpenAI-compatible or Anthropic models, validated and shown as an Apply/Discard preview before it ever touches your canvas |
| **Integrated Debugger** | Breakpoints, step over/into/out, variable inspection, call stacks, conditional stops |
| **14 RPA Libraries** | 120+ ready-made activities covering Desktop, Web, Excel, DataFrames, Database, OCR, HTTP, Credentials and more |
| **Python Bridge** | Asyncio JSON-RPC server — Electron talks to Python over IPC with full type safety |
| **Code Generation** | Diagram → Python, with topology validation before every run |
| **Security First** | SQL injection, path traversal, unsafe `getattr`, and IPC payload validation built-in (v0.3.1) |
| **Persistent Storage** | IndexedDB autosave for processes, variables, and execution history |
| **Multi-Language** | UI and library logging in English (en), Russian (ru), German (de), Spanish (es), Chinese (zh) — [contribute new languages](HOWTO-TRANSLATE.md) |
| **Cross-Platform** | Windows, macOS, Linux — one codebase |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  RPAForge Studio  (Electron 42 + React 19 + TailwindCSS 4)      │
│                                                                  │
│   Designer │ Debugger │ Console │ Recorder                      │
│   React Flow · Monaco Editor · Zustand · Vite 8                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │  JSON-RPC over IPC / Stdio
┌────────────────────────────┴─────────────────────────────────────┐
│  Python Bridge Server  (asyncio JSON-RPC)                        │
│                                                                  │
│   StudioEngine · ProcessRunner · Debugger · Recorder             │
│   CodeGenerator · Topology Validator                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│  RPA Libraries  (14 modules · 120+ activities)                    │
│                                                                  │
│  DesktopUI  WebUI   Excel    Database  OCR   Credentials         │
│  File       HTTP    DateTime String    Flow  Variables  Spy …    │
└──────────────────────────────────────────────────────────────────┘
```

### Packages

```
rpaforge/
├── packages/
│   ├── core/           # Python engine — runner, debugger, bridge, codegen
│   ├── libraries/      # RPA library modules
│   ├── studio/         # Electron + React desktop application
│   └── orchestrator/   # Control Tower (planned)
├── docs/               # MKDocs documentation
├── .github/            # CI/CD workflows (ci, release, codeql, docs)
└── tools/              # Release scripts
```

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10 – 3.13 |
| Node.js | 20+ |
| pnpm | 9+ (or npm 9+) |
| Git | any |
| VS Build Tools | Windows only, for native modules |

### Install & Run

```bash
# 1. Clone
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# 2. Python packages (development mode)
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# 3. Studio UI
cd packages/studio
pnpm install          # or: npm ci --include=optional

# 4. Verify
cd ../..
pytest packages/core/tests -v
cd packages/studio && pnpm test && cd ../..
```

### Start the Studio

```bash
cd packages/studio
pnpm dev              # Vite dev server + Electron hot-reload
```

### Build a Distributable Installer

The installer bundles a frozen Python engine, so **end users do not need Python
installed** — activities work out of the box.

```bash
cd packages/studio
pnpm build:dist       # freezes the engine + builds the NSIS installer
```

The installer is written to `packages/studio/dist-electron/*.exe`. Building one
requires Python + PyInstaller on the build machine; see
[Building the Installer](docs/developer-guide/building-installer.md) for
prerequisites, bundled libraries, and CI details.

### Platform-Specific Setup

<details>
<summary><b>🪟 Windows 11</b></summary>

**Prerequisites:**
- Python 3.10+ (download from [python.org](https://www.python.org/downloads/))
- Node.js 20+ and pnpm (download from [nodejs.org](https://nodejs.org/))
- Visual Studio Build Tools (required for native modules)
  ```powershell
  # Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
  ```

**Installation:**
```powershell
# Clone and setup
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# Install Studio
cd packages/studio
pnpm install
pnpm dev
```

**Running from PowerShell:**
```powershell
# Python tests
pytest packages/core/tests -v
pytest packages/libraries/tests -v

# Studio
cd packages/studio
pnpm dev
pnpm test
```
</details>

<details>
<summary><b>🍎 macOS (Intel & Apple Silicon)</b></summary>

**Prerequisites:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install python@3.12 node pnpm
```

**Installation:**
```bash
# Clone and setup
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# Install Studio
cd packages/studio
pnpm install
pnpm dev
```

**Note for Apple Silicon (M1/M2/M3):**
```bash
# Some dependencies may require native builds, ensure Xcode is fully installed
xcode-select --install
# If issues persist, reset Xcode path
sudo xcode-select --reset
```
</details>

<details>
<summary><b>🐧 Linux (Ubuntu/Debian/Fedora)</b></summary>

**Prerequisites for Ubuntu/Debian:**
```bash
# Update package lists
sudo apt-get update

# Install system dependencies
sudo apt-get install -y \
  python3.12 python3.12-venv python3.12-dev \
  nodejs npm \
  build-essential \
  git

# Install pnpm
npm install -g pnpm
```

**Prerequisites for Fedora/RHEL:**
```bash
# Install system dependencies
sudo dnf install -y \
  python3.12 python3.12-devel \
  nodejs npm \
  gcc g++ make \
  git

# Install pnpm
npm install -g pnpm
```

**Prerequisites for desktop automation (optional):**
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1

# Fedora/RHEL
sudo dnf install -y nss nspr atk libdrm libxkbcommon libgbm
```

**Installation:**
```bash
# Clone and setup
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Create virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
pre-commit install
pip install -e packages/core
pip install -e packages/libraries

# Install Studio
cd packages/studio
pnpm install
pnpm dev
```
</details>

### System Dependencies

<details>
<summary><b>OCR support (all platforms)</b></summary>

```bash
pip install -e "packages/libraries[ocr]"

# Windows: https://github.com/UB-Mannheim/tesseract/wiki
# Linux:   sudo apt-get install tesseract-ocr
# macOS:   brew install tesseract
```
</details>

<details>
<summary><b>Web automation (Playwright)</b></summary>

```bash
pip install -e "packages/libraries[web]"
playwright install    # Downloads browser binaries
```
</details>

---

## RPA Libraries

| Library | Activities | Description | Extra deps |
|---------|-----------|-------------|------------|
| **DesktopUI** | 20+ | Windows UI automation — Win32, WPF, and Java | pywinauto, pillow |
| **WebUI** | 15+ | Browser automation (Chrome, Firefox, and Safari) | playwright |
| **Excel** | 8+ | Read/write XLSX spreadsheets | openpyxl |
| **DataFrames** | 28+ | Tabular data operations — filter, sort, join, aggregate | polars |
| **Database** | 6+ | SQL queries via SQLAlchemy ORM | sqlalchemy |
| **OCR** | 5+ | Text recognition — Tesseract + barcodes | pytesseract, pyzbar, pyautogui |
| **Credentials** | 4+ | Encrypted OS credential store | cryptography, keyring |
| **File** | 8+ | File and folder operations | — |
| **HTTP** | 5+ | REST API requests | requests |
| **DateTime** | 6+ | Date/time utilities | — |
| **String** | 7+ | String manipulation | — |
| **Variables** | 4+ | Variable management and scoping | — |
| **Flow** | 4+ | Control flow — if, while, for | — |
| **Spy** | 3+ | Live UI element inspector overlay | uiautomation, pynput |

Install only what you need:

```bash
pip install -e "packages/libraries[desktop]"    # DesktopUI
pip install -e "packages/libraries[web]"         # WebUI
pip install -e "packages/libraries[dataframes]"  # DataFrames (polars)
pip install -e "packages/libraries[all]"         # Everything
```

---

## Development

### Common Commands

```bash
make test         # Run all Python tests
make lint         # ruff + mypy
make format       # ruff format
make docs         # Build MKDocs
make docs-serve   # Serve docs locally
make studio-dev   # Studio hot-reload

cd packages/studio
pnpm test         # Vitest
pnpm build        # Production build
```

### Tech Stack

**Backend (Python)**
- `asyncio` JSON-RPC bridge
- `Ruff` for linting and formatting
- `pytest` + `pytest-asyncio` for testing
- `mypy` for type checking

**Frontend (TypeScript)**
- React 19 + Vite 8
- React Flow 11 — visual diagram editor
- Zustand 5 — state management
- Monaco Editor — embedded code editor
- TailwindCSS 4 — utility styling
- Electron 42 — desktop packaging

---

## Project Status

| Package | Description | Version | Status |
|---|---|---|---|
| `rpaforge-core` | Engine, debugger, JSON-RPC bridge | v0.5.0 | ✅ Stable |
| `rpaforge-libraries` | 15 RPA library modules | v0.5.0 | ✅ Stable |
| `rpaforge-studio` | Electron + React desktop UI | v0.5.0 | 🔄 Alpha |
| `rpaforge-orchestrator` | Control Tower | — | 🔜 Planned |

---

## Roadmap

### v0.4.x — AI Generation, XYFlow 12 & Plugin Architecture *(released)*
- ✅ **XYFlow 12 Migration**: Modernized React Flow canvas with ELK auto-layout and sub-diagrams
- ✅ **AI Workflow Generation**: Natural language prompt-to-diagram generation (OpenAI, Anthropic, Gemini, Ollama, Groq)
- ✅ **Plugin Architecture & SDK**: Standard entry-points discovery (`rpaforge.libraries`) and `@library`/`@activity` decorators
- ✅ **Polars DataFrames**: Tabular data manipulation with 28 activities and visual debugger inspector
- ✅ **Studio Git Integration**: Embedded source control panel for staging, committing, and remote push/pull
- ✅ **Bundled PyInstaller Distribution**: Standalone Windows installer with embedded Python, Chromium & Tesseract

### v0.5.0 — Unattended Execution & Resilient Work Queues *(released)*
- ✅ **Headless Robot Runner CLI & Daemon (`rpaforge-runner`)**: Standalone unattended execution for Linux/Docker/Windows with supervisor and health probes
- ✅ **Transaction Work Queue Engine**: Dispatcher-Performer pattern, priority scheduling, auto-retry, and dead-letter queues (`rpaforge.queues`)
- ✅ **Multi-Strategy Smart Selectors**: Fallback chains (CSS/XPath → Text Anchors → OpenCV Computer Vision) with confidence scoring
- ✅ **Pluggable Secret Providers**: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and `.env` support
- ✅ **Self-Contained Package Bundler (`.forge`)**: Signed portable automation packages with integrity verification
- ✅ **Resilient Python Bridge**: Process watchdog, automatic crash recovery, in-flight request replay, and binary buffer IPC
- ✅ **Smart Studio UX**: Canvas Quick-Add spotlight search, auto-connect on edge drop, and IntelliSense variable auto-completion

### v0.6.0 — Agentic RPA & Intelligent Document Processing (IDP) *(Q1 2027)*
- [ ] **Agentic Workflow Nodes**: LLM dynamic decision branching, autonomous tool-calling loops, and JSON schema extraction
- [ ] **Native IDP Library**: Multi-modal document parsing for Invoices, Receipts, and IDs with table extraction
- [ ] **VLM Visual Element Grounding**: Natural language visual UI targeting and AI-driven selector self-healing
- [ ] **Human-in-the-Loop (HITL)**: Interactive approval forms, Slack/Teams notifications, and workflow suspension

### v0.7.0 — Enterprise Observability, Security & CI/CD *(Q2 2027)*
- [ ] **OpenTelemetry (OTel)**: Distributed tracing and metrics exported to Jaeger, Prometheus, Datadog
- [ ] **Robot Sandbox & Security Policies**: Permission boundaries for filesystem, network egress, and system calls
- [ ] **Automated Workflow Testing (`rpaforge-test`)**: Unit testing with activity mocking, assertions, and coverage
- [ ] **Official CI/CD Actions**: GitHub Actions and GitLab CI templates for automated linting and execution

### v0.8.0 — Next-Gen Smart Studio & Interactive Debugging *(Q3 2027)*
- [ ] **Unified Hybrid Smart Recorder**: Cross-application recording across Web, Win32, WPF, and terminal
- [ ] **Live Execution Rewind & Hot-Reload**: Checkpoint rewinding and edit-and-continue debugging
- [ ] **Visual Workflow Diffing & Merge Tool**: Graphical side-by-side branch comparison and merge conflicts resolver
- [ ] **Custom Activity Builder**: Package sub-diagrams into reusable drag-and-drop activities

### v0.9.0 — Control Tower / Orchestrator Platform *(Beta - Q4 2027)*
- [ ] **Centralized Control Tower Backend**: FastAPI + PostgreSQL + Redis with REST/WebSocket APIs
- [ ] **Fleet Management & Agent Pairing**: Instant mTLS registration, live heartbeats, and remote deployment
- [ ] **Centralized Scheduling & Event Triggers**: Timezone-aware cron schedules, webhooks, and email triggers
- [ ] **Orchestrator Web Dashboard**: Real-time fleet monitoring, execution streaming, and queue metrics

### v1.0.0 — Production Ready & Enterprise LTS *(Q4 2027)*
- [ ] **High Availability (HA) Clustering**: Multi-node orchestrator with automatic failover
- [ ] **Enterprise Identity (SSO / RBAC)**: SAML 2.0, OIDC, LDAP (Okta, Azure AD, Keycloak) with granular permissions
- [ ] **Full Cross-Platform Parity**: Certified Windows, Linux, and macOS runners with Docker/K8s Helm charts
- [ ] **Enterprise Migration Assistant**: Automated converter for UiPath (`.xaml`) and Robot Framework workflows
- [ ] **Community & Enterprise Marketplace**: Certified connectors, verified plugin registry, and templates hub
- [ ] **Long-Term Support (LTS)**: 3-year stability SLA and backward compatibility guarantee

---


---

## Documentation

| Resource | Description |
|----------|-------------|
| [Getting Started](docs/getting-started/installation.md) | Installation and system setup |
| [Quick Start](docs/getting-started/quick-start.md) | Build your first automation |
| [Developer Guide](AGENTS.md) | Architecture, patterns, code conventions |
| [Contributing](CONTRIBUTING.md) | How to contribute code or docs |
| [Translation Guide](HOWTO-TRANSLATE.md) | Add translations for new languages |
| [Changelog](CHANGELOG.md) | Release notes |
| [Roadmap](ROADMAP.md) | Detailed feature roadmap |

---

## Contributing

Contributions are welcome — bug reports, feature requests, documentation, and code.

```bash
# Fork → clone → branch
git checkout -b feat/my-feature

# Make changes, then
make test && make lint

# Commit (Conventional Commits)
git commit -m "feat(libraries): add PDF extraction keyword"

# Open a PR against main
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow, coding standards, and PR checklist.

New to the project? Pick a task from the curated [good first issues](https://github.com/chelslava/rpaforge/labels/good%20first%20issue) menu - each is small, self-contained, and priority-reviewed.

---

## Acknowledgements

- Visual designer powered by [React Flow](https://reactflow.dev/) and [Electron](https://www.electronjs.org/)
- Desktop automation via [pywinauto](https://pywinauto.readthedocs.io/)
- Web automation via [Playwright](https://playwright.dev/)
- Inspired by UiPath, Blue Prism, and Automation Anywhere

---

<div align="center">

**[GitHub Discussions](https://github.com/chelslava/rpaforge/discussions) · [Issue Tracker](https://github.com/chelslava/rpaforge/issues)**

Apache License 2.0 — Made with care by the RPAForge Community

</div>
