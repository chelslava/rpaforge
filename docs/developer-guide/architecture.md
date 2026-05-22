# RPAForge Architecture

## System Overview

RPAForge is an open-source Robotic Process Automation (RPA) studio built with a three-tier architecture. The system consists of an Electron-based desktop application, a Python bridge server, and native Python RPA libraries.

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop Shell | Electron | 42 |
| UI Framework | React | 19 |
| Build Tool | Vite | 6 |
| State Management | Zustand | 5 |
| Visual Designer | React Flow | 11 |
| Code Editor | Monaco Editor | - |
| Styling | TailwindCSS | 4 |
| Python Runtime | Python | 3.10-3.13 |
| Async Runtime | asyncio | - |
| RPA Bridge | JSON-RPC 2.0 | - |
| Desktop Automation | pywinauto | - |
| Web Automation | Playwright | - |
| Data Processing | Polars | - |
| Code Quality | ruff | - |

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  STUDIO LAYER (Electron 42 + React 19 + TailwindCSS 4)            │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ Designer (React Flow) │ Debugger │ Console │ Recorder │ Spy    ││
│  │ React Flow 11 · Monaco Editor · Zustand 5 · Vite 6            ││
│  └────────────────────────────────────────────────────────────────┘│
└────────────────────────────┬───────────────────────────────────────┘
                             │  JSON-RPC 2.0 over IPC/Stdio
┌────────────────────────────┴───────────────────────────────────────┐
│  BRIDGE LAYER (Python asyncio JSON-RPC Server)                     │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ BridgeServer · BridgeHandlers · Protocol (Request/Response)   ││
│  │ LifecycleHandlers · Shared utilities                           ││
│  └────────────────────────────────────────────────────────────────┘│
└────────────────────────────┬───────────────────────────────────────┘
                             │
┌────────────────────────────┴───────────────────────────────────────┐
│  ENGINE LAYER (Python)                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ ProcessRunner       │  │ ProcessExecutor                       │ │
│  │ (Debugger)          │  │ (Native execution)                    │ │
│  ├─────────────────────┤  ├──────────────────────────────────────┤ │
│  │ BreakpointManager   │  │ Activity Registry                     │ │
│  │ CheckpointManager   │  │ SafeEvaluator (AST-based)             │ │
│  │ Stepping logic      │  │ SubprocessExecutor (timeout isolation)│ │
│  └─────────────────────┘  └──────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ RPA Libraries (14 modules · 80+ activities)                   │  │
│  │ DesktopUI · WebUI · Excel · DataFrames · Database · OCR       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Engine (`packages/core`)

### Executor

The `ProcessExecutor` is the native Python execution engine that runs RPA processes without Robot Framework.

**Key Responsibilities:**
- Execute activities from registered RPA libraries
- Handle timeout enforcement via `ThreadingTimeoutHandler` or `SubprocessExecutor`
- Manage retry logic with exponential backoff
- Implement circuit breaker pattern for resilience
- Emit execution events (start/end for process, task, activity)

**Architecture:**
```
ProcessExecutor
├── _library_provider: LibraryProvider (DefaultLibraryProvider)
├── _timeout_handler: TimeoutHandler (ThreadingTimeoutHandler)
├── _evaluator: ExpressionEvaluator (SafeExpressionEvaluator)
├── _libraries: dict[str, Any] (registered library instances)
├── _listeners: list[Callable] (event listeners)
├── _context: ExecutionContext (runtime execution state)
├── _circuit_breakers: dict[str, CircuitBreakerState]
└── _subprocess_executor: SubprocessExecutor | None
```

**Key Methods:**
- `run(process: Process) -> ExecutionResult` - Execute a process
- `register_library(name: str, instance: Any)` - Register RPA library
- `_execute_activity(library, activity, *args, **kwargs)` - Execute single activity
- `get_variables() -> dict` - Get current runtime variables

### Safe Evaluator

The `SafeEvaluator` provides AST-based safe expression evaluation, replacing Python's `eval()` function for security.

**Security Features:**
- Whitelist-only approach (no dangerous operations)
- Limited operators: arithmetic, comparison, boolean, member access
- Limited builtins: `abs`, `min`, `max`, `round`, `len`, `str`, `int`, `float`, `bool`, `any`, `all`
- Limited string methods: `upper`, `lower`, `strip`, `split`, `replace`, etc.
- Maximum nesting depth: 10 levels
- Maximum list length: 1000 items
- LRU cache for parsed expressions (256 entries)

**Supported Operations:**
- **Arithmetic**: `+`, `-`, `*`, `/`, `//`, `%`, `**`, `<<`, `>>`, `&`, `|`, `^`
- **Comparison**: `==`, `!=`, `<`, `<=`, `>`, `>=`, `is`, `is not`, `in`, `not in`
- **Boolean**: `and`, `or`, `not`
- **Unary**: `+`, `-`, `~`
- **Builtins**: `abs()`, `min()`, `max()`, `round()`, `len()`, `str()`, `int()`, `float()`, `bool()`, `any()`, `all()`
- **String methods**: `upper()`, `lower()`, `strip()`, `split()`, `replace()`, `format()`, etc.

### Checkpoint System

The checkpoint system provides crash recovery by persisting execution state to disk.

**CheckpointData Structure:**
```python
@dataclass
class CheckpointData:
    version: str = "1.0"
    timestamp: str
    process_name: str
    current_node_id: str
    current_task_name: str
    state: str
    variables: dict[str, Any]
    call_stack: list[dict]
    breakpoints: dict[str, dict]
    activity_count: int
    checkpoint_id: str
```

**CheckpointManager Features:**
- Saves checkpoints every N activities (configurable frequency, default 10)
- Maintains rolling window of last K checkpoints (default 3)
- Provides `load()`, `clear()`, `has_checkpoint()` operations
- Checkpoint directory: `.rpaforge_checkpoints/`

---

## Bridge Server (`packages/core/src/rpaforge/bridge/`)

The bridge server implements JSON-RPC 2.0 over stdio for IPC communication between Electron and Python.

### Protocol

**Message Types:**

```python
@dataclass
class JSONRPCRequest:
    method: str
    id: int | str
    params: dict | list | None
    jsonrpc: str = "2.0"

@dataclass
class JSONRPCResponse:
    id: int | str | None
    result: Any | None
    error: JSONRPCError | None

@dataclass
class JSONRPCNotification:
    method: str
    params: dict | list | None
    jsonrpc: str = "2.0"
```

**Error Codes:**
- `-32700` Parse Error
- `-32600` Invalid Request
- `-32601` Method Not Found
- `-32602` Invalid Params
- `-32603` Internal Error
- `-32001` to `-32005` Server-specific errors

### Handler Registration Pattern

Handlers are registered in a dictionary mapping method names to handler functions:

```python
def get_handlers(self) -> dict[str, Callable[[dict], Any]]:
    return {
        "ping": self._handle_ping,
        "getCapabilities": self._handle_get_capabilities,
        "runProcess": self._handle_run_process,
        # ...
    }
```

### Event Streaming

Events are emitted as JSON-RPC notifications (no ID, no response expected):

**Bridge Events:**
| Event Type | Payload |
|------------|---------|
| `log` | `{level, message, source, runId}` |
| `processStarted` | `{processId, name, runId}` |
| `processPaused` | `{file, line, nodeId, reason}` |
| `processResumed` | `{}` |
| `processFinished` | `{status, duration, message}` |
| `processStopped` | `{reason}` |
| `error` | `{code, message}` |
| `bridgeState` | `{state, isOperational, ...}` |

---

## RPA Libraries (`packages/libraries/`)

### Library Structure

RPAForge includes 14 libraries with 80+ activities covering various automation domains.

### Library Categories

| Category | Libraries |
|----------|-----------|
| Desktop automation | DesktopUI |
| Web automation | WebUI, Spy |
| Data processing | Database, Excel, DataFrames |
| Utilities | File, HTTP, OCR, Credentials, DateTime, String, Variables, Flow |

### Activity Decorator Pattern

Activities are registered using decorators:

```python
@library(name="DesktopUI", category="Desktop", icon="🖥")
class DesktopUI:
    """Windows desktop automation library with multi-instance support."""

    @activity(name="Open Application", category="Desktop")
    @tags("application", "startup")
    @output("Application instance ID")
    def open_application(
        self,
        executable: str | Path,
        args: str = "",
        app_id: str | None = None,
        _timeout: str = "30s",
    ) -> str:
        """Open a Windows application."""
        # Implementation
        return instance_id
```

**Decorators:**
- `@library(name, category, icon, scope)` - Register library class
- `@activity(name, category, tags)` - Register activity method
- `@tags(*tags)` - Add additional tags
- `@output(description)` - Mark activity returns a value
- `@param(name, type, label, description, options)` - Specify parameter metadata

### Library Registration

Libraries are automatically registered when the Python bridge starts:

```python
def _ensure_activities_registered(self) -> None:
    library_mappings = [
        ("DesktopUI", "rpaforge_libraries.DesktopUI", "Desktop UI automation"),
        ("Excel", "rpaforge_libraries.Excel", "Excel operations"),
        # ...
    ]
    for lib_name, lib_module, description in library_mappings:
        try:
            import importlib
            module = importlib.import_module(f"{lib_module}.library")
            lib_class = getattr(module, lib_name)
            self._engine.executor.register_library(lib_name, lib_class())
        except ImportError:
            logger.warning(f"{lib_name} library not available")
```

---

## Studio (`packages/studio`)

### Electron Architecture

The Studio uses a privileged Electron architecture with strict security boundaries.

**Three-Layer Architecture:**

1. **Main Process** (`electron/main.ts`)
   - Window management (create, show, close)
   - IPC handler registration
   - Python bridge lifecycle management
   - Spy overlay window
   - File system watching (chokidar)
   - Persistent logging with rotation

2. **Preload Script** (`electron/preload.ts`)
   - Secure context bridge for IPC
   - Exposes validated APIs to renderer
   - Context isolation enabled

3. **Renderer Process** (`src/`)
   - React application
   - Visual process designer (React Flow)
   - Debugger UI
   - Recorder UI

**IPC Communication Flow:**
```
Renderer (React)
    ↓ IPC via contextBridge
Preload (safe bridge)
    ↓ IPC via ipcMain
Main Process (Electron)
    ↓ JSON-RPC over subprocess stdin/stdout
Python Bridge Server
```

### React Components

**Component Organization:**

```
components/
├── Designer/
│   ├── ProcessCanvas.tsx     # React Flow canvas with zoom/pan
│   ├── PropertyPanel/        # Activity property editor
│   ├── ActivityPalette.tsx   # Activity library browser
│   ├── Blocks/               # Custom node types (start, end, activity, flow)
│   └── Edges/                # Custom edge types (smoothstep, step)
├── Debugger/
│   ├── DebuggerPanel.tsx     # Main debugger UI
│   ├── BreakpointPanel.tsx   # Breakpoint management
│   ├── VariablePanel.tsx     # Variable/value viewer
│   └── CallStackPanel.tsx    # Stack trace display
├── Recorder/
│   ├── index.tsx             # Action recorder UI
│   ├── ActionCapture.tsx     # UI element capture
│   └── ActionList.tsx        # Recorded actions list
├── SelectorSpy/
│   └── SelectorSpyDialog.tsx # Element inspector overlay
├── Common/
│   ├── Layout.tsx            # Main layout shell
│   ├── WelcomeScreen.tsx     # Project selection
│   └── Loading.tsx           # Loading indicators
└── Layout/
    ├── Toolbar.tsx           # Main toolbar
    ├── MainContent.tsx       # Workspace area
    ├── SidebarLeft.tsx       # Activity palette sidebar
    └── SidebarRight.tsx      # Properties/debugger panel
```

### State Management (Zustand)

**Key Stores:**

| Store | Purpose | Key State |
|-------|---------|-----------|
| `processStore` | Diagram nodes, edges, execution state | nodes, edges, executionState |
| `debuggerStore` | Breakpoints, variables, call stack | breakpoints, variables, isPaused |
| `executionStore` | Process execution, console output | executionState, currentNodeId |
| `variableStore` | Variable definitions and scopes | variables, scopes |
| `consoleStore` | Log entries and filtering | entries, filter |
| `uiStore` | UI preferences, theme | theme, panel visibility |
| `diagramStore` | React Flow canvas state | nodes, edges, transforms |
| `settingsStore` | User preferences | theme, language, behavior |

**processStore Structure:**
```typescript
interface ProcessState {
  mode: 'standalone' | 'orchestrator'
  orchestratorUrl: string | null
  isConnected: boolean

  metadata: ProcessMetadata | null
  nodes: Node<ProcessNodeData>[]
  edges: Edge[]
  selectedNodeId: string | null
  validationMessage: string | null

  executionState: 'idle' | 'running' | 'paused' | 'stopped'
  executionProgress: number
  currentExecutingNodeId: string | null
  executionSpeed: 0.5 | 1 | 2 | 5

  undoStack: UndoState[]
  redoStack: UndoState[]
}
```

**debuggerStore Structure:**
```typescript
interface DebuggerState {
  connectionState: 'disconnected' | 'connecting' | 'connected'
  breakpoints: Map<string, Breakpoint>
  variables: Variable[]
  callStack: CallFrame[]
  currentFile: string | null
  currentLine: number | null
  isPaused: boolean
  isStepping: boolean
  isDebugging: boolean
}
```

---

## Development Workflow

### Adding a New Activity

1. **Create keyword in library/library.py:**

```python
from rpaforge.core.activity import activity, library, output, tags

@library(name="MyLibrary", category="Category", icon="📦")
class MyLibrary:
    @activity(name="Do Something", category="Category")
    @tags("mylibrary", "action")
    @output("Description of return value")
    def do_something(self, arg: str, optional: int = 0) -> dict:
        """Do something with the provided arguments."""
        return {"result": arg, "count": optional}
```

2. **Register library in StudioEngine:**

The bridge server automatically registers all libraries on startup via `_ensure_activities_registered()`.

### Adding a New Library

1. **Create packages/libraries/src/rpaforge_libraries/NewLibrary/:**

```bash
mkdir -p packages/libraries/src/rpaforge_libraries/NewLibrary
```

2. **Implement library.py with @library decorator:**

```python
from rpaforge.core.activity import activity, library, output, tags

@library(name="NewLibrary", category="Category", icon="📦")
class NewLibrary:
    @activity(name="Activity One", category="Category")
    @tags("new")
    def activity_one(self) -> None:
        """First activity."""
        pass

    @activity(name="Activity Two", category="Category")
    @tags("new")
    @output("Result")
    def activity_two(self) -> str:
        """Second activity."""
        return "result"
```

3. **Export in __init__.py:**

```python
from rpaforge_libraries.NewLibrary.library import NewLibrary

__all__ = ["NewLibrary"]
```

### Testing Strategy

**Core Tests:**
```bash
pytest packages/core/tests -v
```

**Library Tests:**
```bash
pytest packages/libraries/tests -v
```

**Studio Tests:**
```bash
cd packages/studio
pnpm test
```

### Code Formatting and Linting

```bash
# Format Python code
ruff format packages/

# Lint Python code
ruff check packages/

# Type checking
mypy packages/core/src/rpaforge packages/libraries/src/rpaforge_libraries

# Format TypeScript/React
pnpm format:fix

# Lint TypeScript/React
pnpm lint
```

---

## Key Patterns and Conventions

### Subprocess Timeout Pattern

```python
# Preferred: SubprocessExecutor for true timeout enforcement
if self._subprocess_executor is not None:
    return self._subprocess_executor.execute_with_timeout(
        lib_path, activity_name, *args, timeout_ms=timeout_ms, **kwargs
    )

# Fallback: ThreadingTimeoutHandler (may not enforce hard timeout)
return self._timeout_handler.execute_with_timeout(_call, args, timeout_ms)
```

### Safe Expression Evaluation

```python
from rpaforge.core.safe_evaluator import safe_eval

# Safe evaluation with variable context
result = safe_eval("${count} > 10", {"count": 15})
# Returns: True
```

### Event Emission Pattern

```python
def _emit(self, event_dict: dict) -> None:
    if self._emit_event:
        self._emit_event(event_dict)

# Usage
self._emit(ProcessStartedEvent(process_id="123", name="My Process").to_dict())
```

### State Machine Pattern (ProcessRunner)

```python
class RunnerState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLING = "cancelling"
    STOPPED = "stopped"
```

### IPC Channel Pattern

**TypeScript:**
```typescript
export const IPC_CHANNELS = {
  BRIDGE_SEND: 'bridge:send',
  ENGINE_RUN_PROCESS: 'engine:runProcess',
  DEBUGGER_STEP_OVER: 'debugger:stepOver',
  // ...
} as const;
```

**Python:**
```python
def _handle_run_process(self, params: dict) -> dict:
    ...
```

### IndexedDB Persistence

React components use Zustand with persist middleware:
```typescript
export const useProcessStore = create<ProcessState>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'rpaforge-process',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
    }
  )
);
```

---

## Security Considerations

### Input Validation
- Library/activity names validated with regex: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Path traversal prevention in IPC handlers
- Expression length limits (10KB default)
- Control character filtering in strings

### Code Generation Security
- Surrogate character removal
- Variable name validation against Python keywords
- Maximum diagram nodes limit (10000)
- String sanitization before code generation

### IPC Security
- Context isolation enabled
- Node integration disabled
- Preload context bridge for safe API exposure
- CSP headers enforced in production

---

## File Reference

### Core Engine
- `packages/core/src/rpaforge/__init__.py` - Core exports
- `packages/core/src/rpaforge/engine/__init__.py` - Engine exports
- `packages/core/src/rpaforge/core/executor.py` - ProcessExecutor
- `packages/core/src/rpaforge/core/runner.py` - ProcessRunner
- `packages/core/src/rpaforge/core/checkpoint.py` - CheckpointManager
- `packages/core/src/rpaforge/core/safe_evaluator.py` - SafeEvaluator
- `packages/core/src/rpaforge/core/execution.py` - Execution types
- `packages/core/src/rpaforge/core/activity.py` - Activity decorators

### Bridge
- `packages/core/src/rpaforge/bridge/__init__.py` - Bridge exports
- `packages/core/src/rpaforge/bridge/server.py` - BridgeServer
- `packages/core/src/rpaforge/bridge/handlers.py` - BridgeHandlers
- `packages/core/src/rpaforge/bridge/protocol.py` - JSON-RPC protocol
- `packages/core/src/rpaforge/bridge/events.py` - Event types

### Studio (Renderer)
- `packages/studio/src/main.tsx` - Renderer entry point
- `packages/studio/src/App.tsx` - Root component
- `packages/studio/src/stores/processStore.ts` - Process state
- `packages/studio/src/stores/debuggerStore.ts` - Debugger state
- `packages/studio/src/bridge/electron-bridge.ts` - IPC bridge

### Studio (Electron)
- `packages/studio/electron/main.ts` - Main process
- `packages/studio/electron/preload.ts` - Preload bridge
- `packages/studio/electron/python-bridge.ts` - Python subprocess bridge
- `packages/studio/electron/ipc-validator.ts` - IPC validation

### Libraries
- `packages/libraries/src/rpaforge_libraries/__init__.py` - Libraries package
- `packages/libraries/src/rpaforge_libraries/DesktopUI/library.py` - DesktopUI
- `packages/libraries/src/rpaforge_libraries/WebUI/library.py` - WebUI
- `packages/libraries/src/rpaforge_libraries/DataFrames/library.py` - DataFrames
- `packages/libraries/src/rpaforge_libraries/Flow/library.py` - Flow
