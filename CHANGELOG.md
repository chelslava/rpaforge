# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-21

### Added
- **AI-powered diagram generation** — describe a process in natural language and generate
  a diagram via an OpenAI-compatible or Anthropic provider, with an Apply/Discard preview.
  Three layers of validation (AJV schema → activity-registry semantics → diagram-graph
  validation) plus a self-correction retry loop run entirely in the Electron main process;
  API keys are stored via `safeStorage`. Generation also fills in `activityParams` and
  `outputVariable`, auto-creating the referenced variables.
- **Mermaid flowchart import** — import a Mermaid flowchart's shapes and connections
  directly onto the canvas (shape → block-type mapping; node text isn't interpreted).
- **ELK auto-layout** for the canvas, with port-aware ordering for if/switch/try-catch/
  parallel branches and a deterministic while/for-each loop-back edge.
- **Git source control panel** in Studio — status, staging, commit, push, pull, diff, and
  commit history, plus remote URL (origin) configuration from the GUI. Git operations run
  through `simple-git` in the Electron main process behind path/argument validation.
- **Plugin system and Library Development SDK** — third-party RPA libraries are now
  discovered via the `rpaforge.libraries` Python entry-point group
  (`importlib.metadata.entry_points`), the same mechanism pytest/flake8 use for their
  plugins. Replaces the hardcoded `LIBRARY_MAPPINGS` list in
  `bridge/handlers/shared.py`, which was also missing `Credentials` and `Database`
  (same bug class as the historical OCR registration bug). `LibraryMeta.module` is now
  captured automatically by the `@library` decorator and used to fix two places that
  hardcoded the `rpaforge_libraries.` import prefix (`executor.py`'s subprocess
  dispatch, `codegen/python_generator.py`'s generated-script imports) — both now work
  for libraries with any import path, not just the built-in namespace. Adds
  `examples/sdk-hello-library` (a minimal, installable example/template library) and
  `docs/developer-guide/writing-a-library.md`.

### Changed
- **Studio canvas: migrated from React Flow 11 to XYFlow 12** (`@reactflow/*` → `@xyflow/react`) — E1 migration plan, phases 1-4 (#531, part of #513). Package swap, CSS, generic `NodeProps<Node<T>>`/`EdgeProps<Edge<T>>` signatures in 14 blocks + 5 custom edges, `onEdgeUpdate` → `onReconnect`, `node.width/height` → `node.measured.width/height` (align/distribute toolbar + RPA↔React Flow adapter), `useStore(connectionNodeId/connectionHandleType)` → public `useConnection()` hook. `ProcessNodeData`/`ConnectionData` domain types now extend `Record<string, unknown>` to satisfy XYFlow 12's stricter node/edge data constraint.

### Fixed
- Code generation now correctly writes an activity's result to its bound "Save Result To
  Variable" output — previously silently dropped for diagrams built any way, not just via
  AI generation.
- `SubprocessExecutor` no longer raises `AttributeError` when running a class-based library
  activity under a timeout — the worker now instantiates the library's class before
  resolving the activity method, instead of looking the method up directly on the imported
  module (which only exposes the class, not its bound methods).
- `BridgeAPI.send`'s raw JSON-RPC passthrough is now typed via a discriminated
  `BridgeMethodMap`, removing manual `as`-casts at every call site.
- AI generation: 7 bugs found via live testing against free OpenRouter models — silently
  dropped log argument, missing active-process guard, missing `max_tokens` on the
  OpenAI-compatible provider, an incorrectly required `label` field, unvalidated
  `edges.handle` values, undetected response truncation, and OpenRouter returning HTTP 200
  with an error body.

### Security
- Bumped `dompurify` to `>=3.4.11` (via a `pnpm-workspace.yaml` override) and started
  tracking the real `pnpm-lock.yaml` instead of a stale, untracked `package-lock.json` —
  Dependabot alerts now reflect actually-installed versions instead of an 8-day-old snapshot.

## [0.3.9] - 2026-06-08

### Added
- **@rpaforge/activities** — new workspace package (Activity types, registry, builtin activities)
- **@rpaforge/diagram-core** — new workspace package (graph operations, circular dependency detection, 13 tests)
- **@rpaforge/validation** — new workspace package (sub-diagram validation, 10 tests)

### Changed
- Studio imports: Activity types and registry functions now via `domain/activity` shim → `@rpaforge/activities`
- Studio imports: diagram operations and circular dep functions now via `domain/diagram` shim → `@rpaforge/diagram-core`
- Studio imports: validation functions now via `utils/diagramValidation` shim → `@rpaforge/validation`
- `src/types/engine.ts`: Activity types and runtime functions removed (only Bridge/IPC types remain)
- 16 import sites updated from `types/engine` to `domain/activity` for Activity-related imports

### Fixed
- `@rpaforge/validation` TS build: removed `emitDeclarationOnly` so `.js` files are emitted alongside `.d.ts`

## [0.3.8] - 2026-06-04

### Fixed
- Creating a project in a folder failed with `Failed to create project: ... rootPath is not accessible`. Two issues were addressed: (1) the renderer set the project root before the folder existed, and (2) the IPC path validator rejected not-yet-created paths because it `realpath`-ed the full target. The `fs:setProjectRoot` handler now creates the folder before validating, a dedicated `validateProjectRoot` validates the user-chosen root without confining it to the process cwd, and `validateFilePath` now resolves the nearest existing ancestor so new files and subdirectories validate correctly while still blocking symlink traversal and restricted system paths.

## [0.3.7] - 2026-06-04

### Fixed
- Installed app never used the bundled Python engine: stale compiled `electron/*.js` files were committed and shadowed their `.ts` sources during the Vite build (`.js` resolves before `.ts`), so the v0.3.5/v0.3.6 builds silently shipped the old bridge that spawned `python -m rpaforge.bridge.server` instead of the bundled executable — and ignored the writable-cwd fix. Removed the stale artifacts and git-ignored them so the build uses the real sources; the bundled engine and its writable working directory now take effect.

## [0.3.6] - 2026-06-03

### Fixed
- Installed app: the bundled engine crashed on startup with a permission error (`.rpaforge_checkpoints` could not be created) when launched from a read-only location such as Program Files. The engine now runs in a writable per-user working directory, so the bridge starts and activities load.

## [0.3.5] - 2026-06-03

### Added
- Bundle the Python engine into the Windows installer via PyInstaller — installed builds no longer require a separate Python installation; activities work out of the box
- Bundle Playwright Chromium and Tesseract OCR alongside the engine for web automation and OCR support
- Orchestrator package structure (control tower backend)

### Fixed
- Installed app showed "Failed to load activities" because the engine was never packaged in production builds; the bridge now spawns the bundled executable
- Give the bundled engine a longer startup window so a slow cold first launch (antivirus scan) no longer fails fatally

### Removed
- Obsolete NSIS component installer that downloaded Python and pip-installed rpaforge at install time (superseded by the bundled engine)

## [0.3.4] - 2026-06-03

### Added
- Complete onboarding tour with splash screen and initialization flow
- App icon and splash screen with progress indicator
- Improved error handling with error boundary component
- Chinese (zh) language — complete UI translation for all 15 locale files

### Fixed
- i18n: Translate onboarding tour content and buttons to all supported languages (en, ru, de, es, zh)
- Bundle locales into app for offline support
- Disable i18n suspense for file:// builds
- Resolve TypeScript errors in splash screen and onboarding tour
- Correct dist path for production electron builds
- Remove unused i18n imports and non-existent property checks
- Fix onboarding tour hanging issue by improving cleanup and focus management

### Changed
- Start onboarding tour after splash screen initialization
- Improved app initialization flow with better state management

## [0.3.3] - 2026-05-14

### Added
- DataFrames library — 28 tabular data activities powered by Polars (load, filter, sort, join, aggregate, pivot, and more)
- DataFrame variable type — first-class `dataframe` type in the visual designer
- Visual table preview in debugger — inspect DataFrame contents inline when stopped at a breakpoint

### Fixed
- i18n: all UI strings translated to English and Russian

## [0.3.2] - 2026-05-14

### Fixed
- Serialized lifecycle lock for `_handle_run_diagram` — eliminates race conditions under concurrent execution
- Secure `ruff` executable resolution via `shutil.which()` — prevents PATH injection
- Dependency security audit — resolved 14 Dependabot alerts via npm overrides

## [0.3.1] - 2026-04-29

### Security (Critical)
- SQL injection prevention in Database library (table name validation)
- Unsafe getattr prevention in Executor (library/activity name validation)
- Path traversal prevention in File library (symlink validation)
- Null pointer prevention in Electron handlers (window null check)
- File system race condition fix (file descriptor operations)

### Added
- IndexedDB wrapper for large data storage (autosave, variables)
- Project-scoped variables and persistent logging
- Ruff-based Python syntax validation with inline error highlighting
- Python code formatting with ruff integration
- Storage monitoring UI with IndexedDB support
- Welcome screen for first-time users
- ConfirmDialog component for destructive actions

### Fixed
- Variable filtering by project in PropertyPanel and VariablePanel
- Preload script CommonJS format for Electron
- Ruff output parsing for code validation
- TypeScript errors in tests and components
- IndexedDB error handling and logging
- CI: switched from npm/pip to pnpm/uv for faster installs

### Changed
- CI: Python 3.13 for Black formatting
- CI: Node.js 24 for TypeScript analysis

## [0.3.0] - 2026-04-24

### Added
- Core engine with process runner and debugging
- JSON-RPC bridge server for Electron-Python IPC communication
- DesktopUI library with multi-application support (pywinauto)
- WebUI library with Playwright integration
- File operations library (Excel, CSV, file management)
- Database library with SQLAlchemy support
- OCR library with Tesseract and EasyOCR integration
- Secure credentials library with cryptography support
- Studio UI with visual process designer (Electron + React)
- Integrated debugger UI with breakpoints and variable inspection
- Python bridge server for Studio integration
- State management with Zustand stores
- Activity palette with auto-discovery
- Code generation to Python syntax
- Sub-diagram support with parameter mapping
- Variable explorer and manager

### Changed
- Migrated from wrapper to native Python execution engine
- Updated architecture to layered design (UI → IPC → Engine → Libraries)
- Improved debugger with step execution and variable watching
- Enhanced error handling with custom exceptions
- Refactored activity registration system

### Removed
- Legacy wrapper-based execution (replaced by native engine)

## [0.1.0] - TBD (Initial Release)
