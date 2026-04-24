# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Orchestrator package structure (control tower backend)

### Changed
- Updated dependencies to latest versions

## [0.2.0] - 2026-04-24

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
