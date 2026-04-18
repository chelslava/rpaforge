# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public issue for security vulnerabilities
2. Email security reports to: security@rpaforge.dev (or create a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: Next release

### Security Features

RPAForge implements several security measures:

- **Credential Management**: Secure storage via the Credentials library
- **Input Validation**: All user inputs are validated before processing
- **Sandboxed Execution**: Robot Framework processes run in isolation
- **IPC Security**: Electron-Python bridge uses typed contracts

## Security Best Practices

When using RPAForge:

1. **Never hardcode credentials** - Use the Credentials library
2. **Limit automation scope** - Grant minimal required permissions
3. **Review recorded scripts** - Validate before production use
4. **Keep dependencies updated** - Enable Dependabot alerts
5. **Audit selectors** - Ensure selectors target correct elements

## Security Tools

This project uses automated security scanning:

- **CodeQL**: Static analysis for Python and TypeScript
- **Dependabot**: Dependency vulnerability alerts
- **Secret Scanning**: GitHub detects exposed secrets
