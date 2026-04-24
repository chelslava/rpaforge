# RPAForge Wiki

Welcome to RPAForge - an Open Source RPA Studio.

## What is RPAForge?

RPAForge is a visual process designer, recorder, debugger, and orchestrator for RPA automation. It provides:

- **Visual Process Designer** - Drag-and-drop interface for building automation workflows
- **Activity Recorder** - Record user actions and convert them to automation
- **Debugger** - Step-through debugging with variable inspection
- **Orchestrator** - Schedule and manage automated processes

## Core Philosophy

1. **Native** - Full Python execution with debugger support
2. **Visual-First** - No-code/low-code approach with full code access
3. **Modular Design** - Reusable sub-diagrams and component libraries
4. **Best Practices** - Follows Python conventions

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

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

## Documentation

### Getting Started
- [Home](./Home.md) - Overview and quick start
- [MVP Roadmap](./MVP-Roadmap.md) - Development progress

### Architecture
- [Architecture](./Architecture.md) - System architecture and components
- [Visual Block System](./Visual-Block-System.md) - Block types, connections, and visual design
- [Activity Types and SDK](./Activity-Types-and-SDK.md) - Activity classification and SDK for development

### Core Features
- [Project Management](./Project-Management.md) - Projects, linking elements, sub-diagrams
- [Variables Management](./Variables-Management.md) - Variable scopes, types, and best practices
- [Nested Diagrams](./Nested-Diagrams.md) - Sub-diagrams and process composition
- [Python Integration](./Robot-Framework-Integration.md) - Code generation and integration

### Development
- [Best Practices](./Best-Practices.md) - Python and RPAForge conventions

## Activity Types

| Type | Description | Nested | Multiple Outputs |
|------|-------------|--------|------------------|
| **Control** | Start/End points | No | Configurable |
| **Loop** | Iteration constructs | Yes | No |
| **Condition** | Branching logic | Yes | Yes |
| **Container** | Grouping activities | Yes | No |
| **Synchronous** | Blocking operations | No | No |
| **Asynchronous** | Non-blocking operations | No | No |
| **Error Handler** | Exception handling | Yes | No |
| **Sub-Diagram** | Reusable processes | No | No |

## Project Status

See [MVP Roadmap](./MVP-Roadmap.md) for current progress and planned features.

## Contributing

We welcome contributions! See our contributing guidelines for details on how to:
- Report bugs
- Request features
- Submit pull requests
- Develop custom activities

## License

Apache License 2.0
