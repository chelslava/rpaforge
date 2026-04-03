# Project Architecture

## Overview

RPAForge follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
│                    (React + TypeScript)                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │   Designer   │   Debugger   │   Recorder   │ Orchestrator │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      State Management                            │
│                         (Zustand)                                │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │Process Store │Debugger Store│Console Store │Settings Store│  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     IPC Bridge Layer                             │
│                  (Electron IPC + JSON-RPC)                       │
├─────────────────────────────────────────────────────────────────┤
│                     Python Engine Layer                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │ StudioEngine │   Debugger   │   Recorder   │  Code Gen    │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Robot Framework Layer                         │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │  BuiltIn     │SeleniumLib   │  RPA.Desktop │  RPA.Excel   │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
rpaforge/
├── packages/
│   ├── core/                    # Python Core Engine
│   │   ├── src/rpaforge/
│   │   │   ├── engine/          # Execution engine
│   │   │   │   ├── executor.py      # Robot Framework executor
│   │   │   │   ├── suite_builder.py # Build RF suites from diagrams
│   │   │   │   └── codegen.py       # Generate RF code from diagrams
│   │   │   ├── debugger/        # Debugging system
│   │   │   │   ├── breakpoint.py    # Breakpoint management
│   │   │   │   ├── stepper.py       # Step execution control
│   │   │   │   └── inspector.py     # Variable inspection
│   │   │   ├── recorder/        # Action recording
│   │   │   │   ├── recorder.py      # Record user actions
│   │   │   │   └── converter.py     # Convert to RF keywords
│   │   │   ├── bridge/          # IPC Bridge
│   │   │   │   └── server.py        # JSON-RPC server
│   │   │   └── utils/           # Utilities
│   │   └── tests/
│   │
│   ├── libraries/               # RPA Libraries
│   │   └── src/rpaforge_libraries/
│   │       ├── DesktopUI/       # Desktop automation
│   │       ├── WebUI/           # Web automation
│   │       ├── OCR/             # OCR integration
│   │       ├── Excel/           # Excel operations
│   │       ├── Database/        # Database operations
│   │       └── Credentials/     # Secure credential storage
│   │
│   ├── studio/                  # Electron + React UI
│   │   ├── electron/            # Electron main process
│   │   │   ├── main.ts              # Application entry
│   │   │   ├── preload.ts           # Context bridge
│   │   │   └── python-bridge.ts     # IPC client
│   │   └── src/
│   │       ├── components/      # React components
│   │       │   ├── Designer/        # Process designer
│   │       │   ├── Debugger/        # Debug panels
│   │       │   ├── Recorder/        # Recording UI
│   │       │   └── Common/          # Shared components
│   │       ├── stores/          # Zustand stores
│   │       ├── hooks/           # Custom React hooks
│   │       ├── types/           # TypeScript types
│   │       └── utils/           # Utility functions
│   │
│   └── orchestrator/            # Control Tower (future)
│
├── docs/                        # Documentation
└── tests/                       # Integration tests
```

## Core Components

### 1. Visual Designer

The visual designer is built on ReactFlow for graph-based editing:

```typescript
interface Diagram {
  id: string;
  name: string;
  type: 'main' | 'sub-diagram' | 'library';
  nodes: Node<BlockData>[];
  edges: Edge<ConnectionData>[];
  variables: Variable[];
  parameters?: Parameter[];
  returns?: string[];
}
```

**Key Features:**
- Drag-and-drop blocks from palette
- Connect blocks with typed edges
- Nested sub-diagram calls
- Real-time validation

### 2. Python Bridge

Communication between UI and Python engine via JSON-RPC 2.0:

```
┌─────────────┐                    ┌─────────────┐
│  Electron   │  stdin/stdout      │   Python    │
│   (UI)      │◄──────────────────►│   Engine    │
│             │   JSON-RPC 2.0     │             │
└─────────────┘                    └─────────────┘
```

**Protocol:**
```json
// Request
{
  "jsonrpc": "2.0",
  "method": "runProcess",
  "params": {"source": "..."},
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": {"status": "PASS"},
  "id": 1
}

// Notification (events)
{
  "jsonrpc": "2.0",
  "method": "breakpointHit",
  "params": {"file": "test.robot", "line": 15}
}
```

### 3. Code Generator

Converts visual diagrams to Robot Framework syntax:

```python
class DiagramToRobotConverter:
    def convert_diagram(self, diagram: Diagram) -> str:
        """Convert visual diagram to Robot Framework code."""
        builder = SuiteBuilder()
        
        # Generate Variables section
        builder.add_variables(diagram.variables)
        
        # Generate Keywords section (sub-diagrams)
        for sub_diagram in diagram.sub_diagrams:
            builder.add_keyword(sub_diagram)
        
        # Generate Tasks section (main flow)
        builder.add_tasks(diagram.main_flow)
        
        return builder.build()
```

### 4. Debugger

Provides step-through debugging capabilities:

```python
class StudioEngine:
    def __init__(self):
        self.debugger = Debugger()
        self.breakpoints: dict[str, list[Breakpoint]] = {}
    
    async def run_with_debug(self, source: str):
        """Run with debugger attached."""
        async for event in self.debugger.run(source):
            if event.type == 'breakpoint':
                await self.notify_ui({
                    'type': 'breakpointHit',
                    'variables': self.get_variables(),
                    'call_stack': self.get_call_stack()
                })
                await self.wait_for_continue()
```

## Data Flow

### Execution Flow

```
1. User creates diagram in UI
2. UI serializes diagram to JSON
3. JSON sent via IPC to Python engine
4. Python generates Robot Framework code
5. Robot Framework executes the code
6. Events sent back to UI in real-time
7. UI updates visual state
```

### Debug Flow

```
1. User sets breakpoints in UI
2. Breakpoints sent to Python engine
3. Execution pauses at breakpoint
4. Python sends variable state to UI
5. UI shows variable inspector
6. User chooses: continue/step/stop
7. Command sent to Python
8. Execution resumes
```

## State Management

### Zustand Stores

```typescript
// Process Store - Manages current diagram
interface ProcessStore {
  diagrams: Map<string, Diagram>;
  activeDiagram: string | null;
  addNode: (node: Node) => void;
  addEdge: (edge: Edge) => void;
  updateNode: (id: string, data: Partial<BlockData>) => void;
}

// Debugger Store - Manages debug state
interface DebuggerStore {
  isPaused: boolean;
  currentLine: number | null;
  variables: Map<string, unknown>;
  callStack: CallFrame[];
  breakpoints: Map<string, number[]>;
}

// Settings Store - User preferences
interface SettingsStore {
  theme: 'light' | 'dark';
  fontSize: number;
  autoSave: boolean;
  pythonPath: string;
}
```

## Extension Points

### Adding New Activity Library

1. Create Python library in `packages/libraries/`
2. Register with `@library` decorator
3. Add to activity palette in UI
4. Create block component in React

### Adding New Block Type

1. Define block type in TypeScript
2. Create block component with ReactFlow node
3. Add code generation logic
4. Add to activity palette

### Adding New IPC Method

1. Define method in `electron/python-bridge.ts`
2. Implement handler in `rpaforge/bridge/server.py`
3. Add TypeScript types in `src/types/ipc.ts`
