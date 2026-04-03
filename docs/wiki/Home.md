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

## Quick Start

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

## Documentation

### Getting Started
- [Home](./Home) - Overview and quick start
- [MVP Roadmap](./MVP-Roadmap) - Development progress

### Architecture
- [Architecture](./Architecture) - System architecture and components
- [Visual Block System](./Visual-Block-System) - Block types, connections, and visual design
- [Activity Types and SDK](./Activity-Types-and-SDK) - Activity classification and SDK for development

### Core Features
- [Project Management](./Project-Management) - Projects, linking elements, sub-diagrams
- [Variables Management](./Variables-Management) - Variable scopes, types, and best practices
- [Nested Diagrams](./Nested-Diagrams) - Sub-diagrams and process composition
- [Robot Framework Integration](./Robot-Framework-Integration) - RF syntax mapping and code generation

### Development
- [Best Practices](./Best-Practices) - Python, Robot Framework, and RPAForge conventions

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

See [MVP Roadmap](./MVP-Roadmap) for current progress and planned features.

## Contributing

We welcome contributions! See our contributing guidelines for details on how to:
- Report bugs
- Request features
- Submit pull requests
- Develop custom activities

## License

Apache License 2.0
