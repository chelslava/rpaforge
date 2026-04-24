# RPAForge v0.3.0 - Enhanced Stability, Security, and Performance

**Release Date**: April 25, 2026

## 🎉 Release Highlights

This release focuses on three critical areas: **stability**, **security**, and **code quality**. All 319 tests pass successfully, and the codebase is now ready for production use.

## 🚀 What's New

### Core Engine Improvements

#### Subprocess-Based Timeout Handling
Activities now run in isolated subprocesses to prevent resource leaks when timeouts occur. This eliminates the thread-based approach that could cause memory leaks and hanging processes.

#### Safe Condition Evaluator
Breakpoint conditions are now evaluated using AST-based parsing instead of `eval()`, eliminating security risks from user-provided expressions.

#### Non-Blocking Retry
Reduced minimum retry delay to 1ms for better performance during transient failures.

### Electron Security Hardening

#### Content Security Policy (CSP)
Production builds now include strict CSP headers to prevent XSS and injection attacks.

#### IPC Payload Validation
All IPC handlers validate incoming payloads to prevent malicious input.

#### Path Traversal Protection
File system operations validate paths to prevent directory traversal attacks.

### UI Refactoring

#### ProcessCanvas Split
The large `ProcessCanvas.tsx` (644 lines) has been split into:
- `ProcessCanvasGraph.tsx` - Visual rendering only (309 lines)
- `useCanvasInteractions.ts` - Canvas interaction logic hook (140 lines)

#### Better Component Separation
Canvas interaction handlers (drag, drop, connection) are now properly extracted into a reusable hook.

## 📦 Package Versions

| Package | Version | Status |
|---------|---------|--------|
| `rpaforge-core` | 0.3.0 | ✅ Stable |
| `rpaforge-libraries` | 0.3.0 | ✅ Stable |
| `rpaforge-studio` | 0.3.0 | ✅ Alpha |

## ✅ Testing

All 319 tests pass successfully:

```
packages/core/tests/        63 passed
packages/libraries/tests/  256 passed, 2 skipped
```

## 📋 Breaking Changes

**None** - This release is fully backward compatible.

## 🔄 Migration Notes

No code changes required for existing projects. All improvements are transparent:

- Existing workflows will automatically benefit from subprocess isolation
- Breakpoint conditions continue to work without modification
- All existing APIs remain unchanged

## 🐛 Known Issues

None in this release.

## 📚 Documentation

- [Getting Started](https://github.com/chelslava/rpaforge/wiki/Getting-Started)
- [Architecture](https://github.com/chelslava/rpaforge/wiki/Architecture)
- [Developer Guide](https://github.com/chelslava/rpaforge/wiki/Developer-Guide)

## 🙏 Thank You

This release was made possible by the community.

## 🔗 Resources

- [GitHub Repository](https://github.com/chelslava/rpaforge)
- [Issue Tracker](https://github.com/chelslava/rpaforge/issues)
- [Discussions](https://github.com/chelslava/rpaforge/discussions)

**Made with ❤️ by the RPAForge Community**
