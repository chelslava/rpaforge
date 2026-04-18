# RPAForge MVP Roadmap

**Created**: 2026-04-14
**Target MVP**: v0.1.0 (Q2 2026)

---

## Project Status Summary

| Component | Status | Readiness |
|-----------|--------|-----------|
| Core Engine | ✅ Complete | 95% |
| Bridge/IPC | ✅ Complete | 95% |
| DesktopUI Library | ✅ Implemented | 85% |
| WebUI Library | ✅ Implemented | 80% |
| Studio UI | ✅ Partial | 80% |
| Debugger | ✅ Partial | 70% |
| Code Generator | ✅ Complete | 85% |
| Tests (Core) | ✅ Present | 98 tests |
| Tests (Studio) | ✅ Present | 22 tests |
| OCR Library | ❌ Missing | 0% |
| Excel Library | ❌ Missing | 0% |
| Database Library | ❌ Missing | 0% |
| Credentials Library | ❌ Missing | 0% |
| Orchestrator | ❌ Planned | 0% |

---

## Sprint 1: Core Reliability (Week 1)

**Goal**: Stability improvements for production readiness

### Tasks

| ID | Activity | Priority | Estimate | Status | Dependencies |
|----|----------|----------|----------|--------|--------------|
| C-001 | Add error context propagation with stack trace | P0 | 2h | ✅ done | None |
| C-002 | Implement timeout enforcement per activity | P0 | 4h | ✅ done | None |
| C-003 | Add retry mechanism with exponential backoff | P0 | 4h | ✅ done | C-002 |
| B-001 | Add heartbeat/ping mechanism | P0 | 2h | ✅ done | None |

**Total**: 12h completed

---

## Sprint 2: MVP Polish (Week 2)

**Goal**: Production-ready debugger and output

### Tasks

| ID | Activity | Priority | Estimate | Status | Dependencies |
|----|----------|----------|----------|--------|--------------|
| DBG-008 | Execution highlight on canvas | P0 | 3h | ✅ done | None |
| EX-005 | Output console panel | P0 | 3h | ✅ done | None |
| PP-003 | Expression editor with validation | P1 | 2h | ✅ done | PP-001 |
| PP-004 | Timeout/retry settings UI | P1 | 2h | ✅ done | PP-001 |
| DC-003 | Zoom and pan controls | P1 | 2h | ✅ done | None |
| DC-006 | Copy/paste nodes | P1 | 3h | ✅ done | None |

**Total**: 15h completed

---

## Sprint 3: Quality & CI (Week 3)

**Goal**: Automated testing pipeline

### Tasks

| ID | Activity | Priority | Estimate | Status | Dependencies |
|----|----------|----------|----------|--------|--------------|
| T-001 | Add unit tests for DesktopUI library | P1 | 4h | ✅ done | None |
| T-002 | Add unit tests for WebUI library | P1 | 4h | ✅ done | None |
| T-003 | Add integration tests for Bridge | P1 | 6h | ✅ done | None |
| T-005 | Setup CI/CD pipeline (GitHub Actions) | P1 | 4h | ✅ done | T-001 |
| DOC-001 | Write Getting Started guide | P1 | 4h | ✅ done | None |

**Total**: 22h completed

---

## Sprint 4: Library Extensions (Week 4)

**Goal**: Enhanced library capabilities

### Tasks

| ID | Activity | Priority | Estimate | Status | Dependencies |
|----|----------|----------|----------|--------|--------------|
| D-001 | Add element selector validation/preview | P1 | 3h | ✅ done | None |
| D-002 | Implement screenshot on failure | P1 | 2h | ✅ done | None |
| D-003 | Add Wait Until Element Contains Text | P1 | 2h | ✅ done | None |
| D-004 | Add Get Element Attribute activity | P1 | 2h | ✅ done | None |
| W-001 | Add element selector validation | P1 | 2h | ✅ done | None |
| W-002 | Add Wait Until Element Contains Text | P1 | 2h | ✅ done | None |
| W-003 | Add Handle Dialog/Alert activity | P1 | 3h | ✅ done | None |
| W-004 | Add Upload File activity | P1 | 3h | ✅ done | None |
| W-005 | Add Download File activity | P1 | 2h | ✅ done | None |
| W-008 | Add screenshot on failure | P1 | 2h | ✅ done | None |
| L-001 | Implement Excel library skeleton | P2 | 4h | ✅ done | None |

**Total**: 27h completed

---

## Sprint 5: Code Generation & Property Editors (Week 5)

**Goal**: Complete codegen and property editors

### Tasks

| ID | Activity | Priority | Estimate | Status | Dependencies |
|----|----------|----------|----------|--------|--------------|
| CG-001 | Throw block Python codegen | P1 | 1h | ✅ done | None |
| CG-002 | Multiple except blocks in try-catch | P1 | 2h | ✅ done | None |
| CG-003 | Typed exceptions in codegen | P1 | 1h | ✅ done | None |
| PE-001 | ThrowBlockEditor component | P1 | 1h | ✅ done | None |
| PE-002 | RetryScopeBlockEditor component | P1 | 1h | ✅ done | None |
| PE-003 | StartBlockEditor: add tags field | P2 | 1h | ✅ done | None |
| PE-004 | WhileBlockEditor: add timeout field | P2 | 0.5h | ✅ done | None |
| PE-005 | ForEachBlockEditor: add timeout field | P2 | 0.5h | ✅ done | None |
| PE-006 | AssignBlockEditor: add variableType/scope | P2 | 1h | ✅ done | None |
| PE-007 | TryCatchBlockEditor: dropdown for exceptionType | P2 | 0.5h | ✅ done | None |

**Total**: 9.5h completed

---

## Already Completed (Pre-MVP)

| ID | Activity | Status |
|----|----------|--------|
| Core Engine | executor.py, runner.py, execution.py, activity.py | ✅ done |
| Bridge Server | server.py, handlers.py, protocol.py | ✅ done |
| DesktopUI | 15 keywords implemented | ✅ done |
| WebUI | 23 keywords implemented | ✅ done |
| Studio Layout | Layout, Toolbar, StatusBar, Sidebar | ✅ done |
| Designer Blocks | Activity, Start, End, If, While, ForEach, TryCatch | ✅ done |
| Property Panel | Activity parameter editor, Variable picker | ✅ done |
| Activity Palette | Search/filter, categories grouping | ✅ done |
| Debugger Core | Breakpoints, Step Over/Into/Out | ✅ done |
| Variable Panel | Variable inspection | ✅ done |
| Call Stack Panel | Call stack visualization | ✅ done |
| Code Generator | Python code generation | ✅ done |
| Code Modal | Code preview modal | ✅ done |
| File Operations | New, Open, Save, Auto-save | ✅ done |
| Execution Controls | Run, Stop, Pause/Resume buttons | ✅ done |

---

## Metadata Schema

```yaml
activity:
  id: string           # Unique ID (C-001, S-003, etc.)
  name: string         # Activity name
  category: string     # core | library | studio | debugger | testing | docs
  subcategory: string  # engine | bridge | desktop | web | canvas | panel
  priority: P0|P1|P2|P3
  status: done | partial | pending
  estimate: number     # Hours estimate (0 if done)
  complexity: low | medium | high
  dependencies: list
  tags: list
  files: list          # Related absolute file paths
```

---

## Progress Tracking

- **Sprint 1**: 4/4 tasks (100%) ✅
- **Sprint 2**: 6/6 tasks (100%) ✅
- **Sprint 3**: 5/5 tasks (100%) ✅
- **Sprint 4**: 11/11 tasks (100%) ✅
- **Sprint 5**: 10/10 tasks (100%) ✅

**Total MVP Progress**: 36/36 tasks (100%) ✅

**MVP v0.1.0 COMPLETE**

---

## Next Phase: v0.2.0

See [v0.2.0-roadmap.md](./v0.2.0-roadmap.md) for:
- Basic Built-in Activities (File, String, DateTime, Variables)
- Canvas UX Improvements (Alignment, Context Menu)
- Execution UX (History, Run from Here)
- HTTP/API Activities
- Email Activities
- OCR, PDF, Database Libraries

---

## Changes Made (2026-04-14)

### Core Engine Improvements

1. **Error Context Propagation** (C-001)
   - Added `ErrorContext` dataclass with full debugging info
   - Enhanced `ExecutionError` with `from_exception` factory method
   - Error results now include: stack trace, timestamp, resolved args/kwargs, process/task/activity info

2. **Timeout Enforcement** (C-002)
   - Added `timeout_ms` field to `ActivityCall`
   - Implemented timeout with threading in `_execute_activity`
   - Added `TimeoutError` exception class
   - Timeout errors are properly reported in activity results

3. **Retry Mechanism** (C-003)
   - Added retry fields to `ActivityCall`: `retry_count`, `retry_delay_ms`, `retry_backoff`, `continue_on_error`
   - Implemented exponential backoff retry in `_run_activity`
   - Retry attempts tracked in activity results
   - `continue_on_error` flag allows execution to continue after failure

4. **Heartbeat/Ping** (B-001)
   - Enhanced ping handler with status info
   - Returns: processId, isRunning, isPaused, status
    - Tracks last heartbeat timestamp

---

## Changes Made (2026-04-14) - Sprint 2

### Studio UI Improvements

1. **Execution Highlight** (DBG-008) - Already implemented
   - `withBreakpoint` HOC in `/packages/studio/src/components/Designer/Blocks/withBreakpoint.tsx`
   - Shows pulsing ring around currently executing node
   - Uses `currentExecutingNodeId` from processStore

2. **Output Console Panel** (EX-005) - Already implemented
   - `ConsoleOutput` component connected to bridge events via `useEngine` hook
   - Logs process events: started, paused, resumed, finished, stopped, errors
   - Filter, search, export, auto-scroll features

3. **Expression Editor Validation** (PP-003) - NEW
   - Added `validateExpression` function in ExpressionEditor.tsx
   - Checks: unmatched brackets, unknown variables, unclosed strings
   - Visual feedback: red/green border, error icon, error messages
   - New props: `validate`, `required`, `onValidationChange`

4. **Timeout/Retry Settings UI** (PP-004) - Already implemented
   - PropertyPanel shows timeout, retry, continue-on-error settings
   - Conditional display based on activity capabilities

5. **Zoom and Pan Controls** (DC-003) - Already implemented
   - ReactFlow Controls component provides zoom buttons
   - Mouse wheel zoom, pan on drag (middle/right button)
   - MiniMap for navigation overview

6. **Copy/Paste Nodes** (DC-006) - NEW
   - Added clipboard state to processStore
   - Actions: `copySelectedNodes`, `pasteNodes`, `cutSelectedNodes`, `duplicateSelectedNodes`
   - Keyboard shortcuts: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+D
    - Start nodes are excluded from cut/copy operations

---

## Changes Made (2026-04-14) - Sprint 3

### Testing & CI

1. **DesktopUI Tests** (T-001) - Already existed
   - 14 tests in `/packages/libraries/tests/test_desktop_ui.py`
   - Tests: library import, initialization, selector parsing, timeout parsing, keyword signatures

2. **WebUI Tests** (T-002) - Already existed
   - 16 tests in `/packages/libraries/tests/test_web_ui.py`
   - Tests: library import, browser initialization, timeout parsing, keyword signatures, activity decorators

3. **Bridge Integration Tests** (T-003) - NEW
   - Created `/packages/core/tests/test_bridge.py` with 17 tests
   - Tests: protocol parsing, event serialization, handler integration
   - Uses real StudioEngine for integration testing
   - Covers: ping, getCapabilities, getActivities, process lifecycle, error handling

4. **CI/CD Pipeline** (T-005) - Already existed
   - GitHub Actions workflow at `.github/workflows/ci.yml`
   - Multi-OS testing: ubuntu, windows, macos
   - Multi-Python: 3.10, 3.11, 3.12
   - Lint: ruff, black
   - Test: pytest with coverage
   - Build: Python packages

5. **Getting Started Guide** (DOC-001) - Already existed
   - `/docs/getting-started/quick-start.md`
   - Examples: Desktop automation (Notepad), Web automation (Google search), Python API
    - Links to user guide, library reference, developer guide

---

## Changes Made (2026-04-14) - Sprint 4

### DesktopUI Library Extensions

1. **Validate Selector** (D-001)
   - `validate_selector(selector, timeout)` - returns dict with found, visible, enabled, text

2. **Screenshot on Failure** (D-002)
   - `set_screenshot_on_failure(enabled, directory)` - configure auto-screenshot
   - `_take_failure_screenshot(context)` - internal method for error handling

3. **Wait Until Element Contains Text** (D-003)
   - `wait_until_element_contains_text(selector, text, timeout, case_sensitive)`
   - Polls element until text appears or timeout

4. **Get Element Attribute** (D-004)
   - `get_element_attribute(selector, attribute)` - supports text, class, id, enabled, visible, rectangle
   - `get_element_properties(selector)` - returns all common properties in dict

### WebUI Library Extensions

1. **Validate Selector** (W-001)
   - `validate_selector(selector, timeout)` - returns dict with found, visible, enabled, text

2. **Wait Until Element Contains Text** (W-002)
   - `wait_until_element_contains_text(selector, text, timeout, case_sensitive)`

3. **Handle Dialog/Alert** (W-003)
   - `handle_dialog(action, prompt_text)` - accept or dismiss browser dialogs

4. **Upload File** (W-004)
   - `upload_file(selector, file_path)` - set file input for upload

5. **Download File** (W-005)
   - `download_file(selector, save_path)` - click link and save download

6. **Screenshot on Failure** (W-008)
   - `set_screenshot_on_failure(enabled, directory)` - configure auto-screenshot
   - `_take_failure_screenshot(context)` - internal method

7. **Get Element Properties** (Additional)
   - `get_element_properties(selector)` - returns text, tag_name, is_visible, is_enabled, value, etc.
