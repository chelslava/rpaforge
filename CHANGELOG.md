# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Orchestrator package structure (control tower backend)

## [0.3.4] - 2026-06-03

### Added
- Complete onboarding tour with splash screen and initialization flow
- App icon and splash screen with progress indicator
- Improved error handling with error boundary component

### Fixed
- i18n: Translate onboarding tour content and buttons to all supported languages
- Bundle locales into app for offline support
- Disable i18n suspense for file:// builds
- Resolve TypeScript errors in splash screen and onboarding tour
- Correct dist path for production electron builds
- Remove unused i18n imports and non-existent property checks
- Fix onboarding tour hanging issue by improving cleanup and focus management

### Changed
- Start onboarding tour after splash screen initialization
- Improved app initialization flow with better state management

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
