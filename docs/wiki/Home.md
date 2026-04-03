# RPAForge Wiki

Welcome to RPAForge - an Open Source RPA Studio built on Robot Framework.

## What is RPAForge?

RPAForge is a visual process designer, recorder, debugger, and orchestrator for RPA automation. It provides:

- **Visual Process Designer** - Drag-and-drop interface for building automation workflows
- **Activity Recorder** - Record user actions and convert them to automation
- **Debugger** - Step-through debugging with variable inspection
- **Orchestrator** - Schedule and manage automated processes

## Core Philosophy

1. **Robot Framework Native** - Built on and generates standard Robot Framework syntax
2. **Visual-First** - No-code/low-code approach with full code access
3. **Modular Design** - Reusable sub-diagrams and component libraries
4. **Best Practices** - Follows Python and Robot Framework conventions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RPAForge Studio                          │
│                    (Electron + React + TypeScript)              │
├─────────────────────────────────────────────────────────────────┤
│  Visual Designer  │  Debugger  │  Recorder  │  Orchestrator    │
├─────────────────────────────────────────────────────────────────┤
│                     Python Bridge (IPC)                         │
├─────────────────────────────────────────────────────────────────┤
│     Core Engine   │   RPA Libraries   │   Robot Framework       │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Links

- [Project Architecture](./Architecture)
- [Visual Block System](./Visual-Block-System)
- [Variables Management](./Variables-Management)
- [Nested Diagrams](./Nested-Diagrams)
- [Robot Framework Integration](./Robot-Framework-Integration)
- [Best Practices](./Best-Practices)

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Robot Framework 5.0+

### Installation
```bash
# Clone repository
git clone https://github.com/chelslava/rpaforge.git
cd rpaforge

# Install Python dependencies
pip install -r requirements-dev.txt
pip install -e packages/core
pip install -e packages/libraries

# Install UI dependencies
cd packages/studio
npm install

# Run development mode
npm run electron:dev
```

## Project Status

See [MVP Roadmap](./MVP-Roadmap) for current progress and planned features.

## Contributing

See [Contributing Guidelines](./Contributing) for details on how to contribute.
