# MVP Roadmap

## Completed ✅

### Milestone 1: IPC Infrastructure
- [x] #1 Python Bridge Server
- [x] #2 Electron Python Bridge Integration
- [x] #3 IPC TypeScript Types

### Milestone 2: Basic Editor (Part 1)
- [x] #4 Zustand Stores Implementation
- [x] #5 Custom Hooks Implementation
- [x] #6 Activity Palette - Drag and Drop
- [x] #7 Process Canvas - Drop and Node Management
- [x] #8 Property Panel - Activity Editor

### Milestone 3: Debugger
- [x] #9 Debugger UI Panels

### Milestone 4: Testing
- [x] #10 DesktopUI Library Tests
- [x] #11 WebUI Library Tests
- [x] #12 UI Component Tests

### Milestone 5: SDK & Designer Parity
- [x] #27 Code Generator - Diagram to Python
- [x] #28 Variables Management UI
- [x] #29 Debugger UI Integration (step buttons connected)
- [x] #30 File Operations - Save/Load/Export
- [x] #31 Activity Registry and Auto-Discovery
- [x] #34 Connector Semantics + Single Start Invariant
- [x] #33 SDK Activity UI Parity in Designer
- [x] #36 Designer SDK/Wiki Parity (Umbrella)

## In Progress 🚧

### Milestone 2: Basic Editor (Part 2)
- [ ] #20 Block Connection System Implementation
- [ ] #22 Visual Block System Design
- [ ] #25 Variables Management System

## Planned 📋

### High Priority

| Issue | Title | Description |
|-------|-------|-------------|
| #18 | Flow Control Blocks | IF, WHILE, FOR, Start, End blocks |
| #19 | Error Handling Blocks | TRY/EXCEPT/FINALLY block |
| #23 | Nested Diagrams | Sub-diagram system |
| #24 | Project Explorer | File management UI |

### Medium Priority

| Issue | Title | Description |
|-------|-------|-------------|
| #13 | Excel Library | Excel operations library |
| #21 | Activity Palette Categorization | Organize activities by category |

### Low Priority

| Issue | Title | Description |
|-------|-------|-------------|
| #14 | OCR Library | OCR integration |
| #15 | Database Library | Database operations |
| #16 | Credentials Library | Secure credential storage |

## Timeline

### Phase 1: Core Editor (Current)
**Goal**: Functional visual designer with basic blocks

- Block connection system
- Visual block components
- Variables management
- Flow control blocks
- Error handling blocks

**Estimated**: 4-6 weeks

### Phase 2: Project Management
**Goal**: Complete project organization

- Nested diagrams
- Project explorer
- Activity categorization
- File management

**Estimated**: 3-4 weeks

### Phase 3: Advanced Features
**Goal**: Enhanced functionality

- Code generation optimization
- Debugging improvements
- Recorder functionality
- Orchestrator basics

**Estimated**: 4-6 weeks

### Phase 4: Libraries & Polish
**Goal**: Complete library support

- Excel library
- OCR library
- Database library
- Credentials library

**Estimated**: 4-6 weeks

## Architecture Decisions

### Technology Stack
- **Frontend**: Electron + React + TypeScript + TailwindCSS
- **State**: Zustand
- **Graph**: ReactFlow
- **Backend**: Python
- **Communication**: JSON-RPC 2.0 over stdin/stdout

### Design Principles
1. **Native**: Generate Python code
2. **Visual-First**: No-code/low-code with full code access
3. **Modular**: Reusable sub-diagrams and libraries
4. **Best Practices**: Follow Python and RF conventions

### File Structure
```
project/
├── processes/          # Diagrams and RF files
├── variables/         # Variable files
├── secrets/           # Encrypted credentials
└── rpaforge.json      # Project config
```

## Success Criteria

### MVP Ready When:
- [x] Can create visual diagrams
- [x] Can connect blocks with proper flow
- [ ] Can use all flow control blocks
- [ ] Can handle errors with TRY/EXCEPT
- [x] Can manage variables (global/local)
- [ ] Can create and call sub-diagrams
- [x] Can generate valid Python code
- [x] Can execute generated code
- [x] Can debug with breakpoints
- [x] Can inspect variables during debug

### v1.0 Ready When:
- [ ] All MVP criteria met
- [ ] Project explorer complete
- [ ] Activity palette categorized
- [ ] All core libraries implemented
- [ ] Documentation complete
- [ ] Test coverage > 80%
- [ ] CI/CD pipeline working

## Contributing

See [Contributing Guidelines](../../CONTRIBUTING.md) for details.

## Progress Tracking

Track progress on [GitHub Projects](https://github.com/chelslava/rpaforge/projects)
