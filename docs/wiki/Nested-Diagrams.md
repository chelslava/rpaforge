# Nested Diagrams

## Overview

RPAForge supports nested diagrams for creating modular, reusable automation components. This enables better organization, code reuse, and maintainability.

## Concept

### Diagram Hierarchy

```
Project
├── Main Process (diagram)
│   ├── Start
│   ├── Login Flow (sub-diagram reference)
│   ├── Process Data (sub-diagram reference)
│   │   ├── Validate Input (nested sub-diagram)
│   │   ├── Transform Data (nested sub-diagram)
│   │   └── Save Results (nested sub-diagram)
│   └── End
│
├── Login Flow (reusable diagram)
│   ├── Start → receives parameters
│   ├── Open Browser
│   ├── Enter Credentials
│   ├── Click Login
│   └── End → returns success/failure
│
├── Process Data (diagram)
│   ├── Start → receives parameters
│   ├── [Process logic]
│   └── End → returns result
│
└── Shared Utilities (folder)
    ├── Wait For Element
    ├── Take Screenshot
    └── Log Error
```

## Diagram Types

### Main Diagram

Entry point of the automation. Single instance per process.

**Robot Framework Mapping:**
```robotframework
*** Tasks ***
Main Process
    Login Flow    ${username}    ${password}
    Process Data    ${input_file}
```

**Properties:**
- `name`: Process name
- `description`: Process description
- `tags`: Categorization tags
- `timeout`: Maximum execution time

### Sub-Diagram (Reusable)

Can be called from any diagram. Accepts parameters and returns values.

**Robot Framework Mapping:**
```robotframework
*** Keywords ***
Login Flow
    [Arguments]    ${username}    ${password}
    Open Browser    ${URL}
    Input Text    username_field    ${username}
    Input Text    password_field    ${password}
    Click Button    login_button
    ${success}=    Verify Login Success
    [Return]    ${success}
```

**Properties:**
- `name`: Keyword name
- `parameters`: Input parameters
- `returns`: Return values
- `documentation`: Keyword documentation
- `tags`: Keyword tags

### Library Diagram

Collection of utility keywords that can be imported by other projects.

**Robot Framework Mapping:**
```robotframework
# utilities.resource
*** Keywords ***
Wait For Element
    [Arguments]    ${locator}    ${timeout}=30s
    Wait Until Element Is Visible    ${locator}    ${timeout}

Take Screenshot
    [Arguments]    ${name}
    Capture Page Screenshot    ${name}.png
```

## Visual Representation

### Sub-Diagram Call Block

```
   ┌─────────────────────────────────────┐
   │ 📞 Call: Login Flow                 │  ← Purple header
   ├─────────────────────────────────────┤
   │ Inputs:                             │
   │  • username: ${user}               │
   │  • password: ${pass}               │
   ├─────────────────────────────────────┤
   │ Outputs:                            │
   │  • success → ${login_result}       │
   ├─────────────────────────────────────┤
   │ ○                                  ○│
   └─────────────────────────────────────┘
```

**Features:**
- Icon: phone/link icon (📞)
- Shows diagram name
- Parameter mapping
- Return value binding
- Double-click to open sub-diagram

### Nested Container View

When inside a sub-diagram call, show nested activities:

```
Main Process
├── Start
├── 📞 Login Flow (expanded)
│   ├── Open Browser
│   ├── Input Credentials
│   └── Click Login
├── 📞 Process Data
│   ├── 📞 Validate Input
│   │   ├── Check File Exists
│   │   └── Parse Data
│   ├── 📞 Transform Data
│   │   ├── Apply Rules
│   │   └── Format Output
│   └── 📞 Save Results
│       ├── Write File
│       └── Send Notification
└── End
```

## Navigation

### Breadcrumb Navigation

```
Main Process → Process Data → Transform Data
    ↑            ↑               ↑ (current)
  click to     click to         current diagram
  navigate     navigate
```

### Tab-Based Editing

```
┌─────────┬─────────────┬───────────────┬─────┐
│ Main    │ Login Flow  │ Process Data  │  +  │
│  ●      │             │               │     │
└─────────┴─────────────┴───────────────┴─────┘
  ↑            ↑               ↑
  unsaved    saved           saved
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Click` | Open sub-diagram in new tab |
| `Alt+←` | Navigate back |
| `Alt+→` | Navigate forward |
| `Ctrl+W` | Close current tab |
| `Ctrl+Shift+T` | Reopen closed tab |

## Parameter Mapping

### Input Parameters

```
┌─────────────────────────────────────────────────┐
│ Call: Login Flow                         [×]    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Input Parameters                               │
│  ┌────────────────────────────────────────────┐ │
│  │ username    [ ${user}           ▼]         │ │
│  │ password    [ ${pass}           ▼]         │ │
│  │ url         [ ${URL}            ▼]         │ │
│  │             ☑ Use default                │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  Variables available:                           │
│  • ${user} - "admin"                           │
│  • ${pass} - ••••••••                          │
│  • ${URL} - "https://example.com"              │
│                                                 │
│  [Open Diagram]              [Apply] [Cancel]  │
└─────────────────────────────────────────────────┘
```

### Return Values

```
┌─────────────────────────────────────────────────┐
│ Return Values: Login Flow                [×]    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Map returns to local variables:                │
│  ┌────────────────────────────────────────────┐ │
│  │ success  → [ ${login_success}   ▼]         │ │
│  │ user_id  → [ ${current_user_id} ▼]         │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ☑ Create new variable if doesn't exist       │
│                                                 │
│              [Apply]           [Cancel]        │
└─────────────────────────────────────────────────┘
```

## File Structure

### Project Organization

```
project/
├── processes/
│   ├── main.robot              # Main process (RF code)
│   ├── main.diagram.json       # Main process (visual)
│   │
│   ├── authentication/
│   │   ├── login.flow.robot
│   │   ├── login.flow.diagram.json
│   │   ├── logout.flow.robot
│   │   ├── logout.flow.diagram.json
│   │   └── __init__.robot      # Resource file
│   │
│   ├── data-processing/
│   │   ├── validate.flow.robot
│   │   ├── transform.flow.robot
│   │   ├── save.flow.robot
│   │   └── __init__.robot
│   │
│   └── shared/
│       ├── utilities.flow.robot
│       └── __init__.robot
│
├── variables/
│   ├── default.py              # Default variables
│   ├── staging.py              # Staging environment
│   └── production.py           # Production environment
│
├── secrets/
│   ├── default.enc             # Encrypted secrets
│   └── .gitignore              # Never commit secrets
│
├── rpaforge.json               # Project config
└── README.md
```

### Project Configuration

```json
{
  "name": "My RPA Project",
  "version": "1.0.0",
  "description": "Automation project for XYZ",
  "main": "processes/main.robot",
  "diagrams": [
    {
      "id": "main",
      "name": "Main Process",
      "path": "processes/main.diagram.json",
      "type": "main"
    },
    {
      "id": "login",
      "name": "Login Flow",
      "path": "processes/authentication/login.flow.diagram.json",
      "type": "sub-diagram",
      "inputs": [
        {"name": "username", "type": "string"},
        {"name": "password", "type": "secret"}
      ],
      "outputs": [
        {"name": "success", "type": "boolean"}
      ]
    }
  ],
  "variables": {
    "default": "variables/default.py",
    "staging": "variables/staging.py",
    "production": "variables/production.py"
  },
  "settings": {
    "defaultTimeout": 30000,
    "screenshotOnError": true,
    "logLevel": "INFO"
  }
}
```

## Robot Framework Generation

### Main Process

```robotframework
*** Settings ***
Documentation     Main automation process
Resource          authentication/login.flow.robot
Resource          data-processing/validate.flow.robot
Resource          data-processing/transform.flow.robot
Resource          data-processing/save.flow.robot

*** Variables ***
${username}       default_user
${input_file}     data.xlsx

*** Tasks ***
Main Process
    [Documentation]    Main automation entry point
    ${login_success}=    Login Flow    ${username}    ${password}
    Run Keyword If    not ${login_success}    Fatal Error    Login failed
    
    ${validated}=    Validate Input    ${input_file}
    ${transformed}=    Transform Data    ${validated}
    ${saved}=    Save Results    ${transformed}
    
    Log    Process completed: ${saved}
```

### Sub-Diagram

```robotframework
*** Keywords ***
Login Flow
    [Documentation]    Performs user login
    [Arguments]    ${username}    ${password}    ${url}=${URL}
    
    Open Browser    ${url}    ${BROWSER}
    Input Text    id=username    ${username}
    Input Text    id=password    ${password}
    Click Button    id=login
    
    ${success}=    Run Keyword And Return Status
    ...    Wait Until Element Is Visible    id=welcome    timeout=10s
    
    [Return]    ${success}
```

### Resource File

```robotframework
# authentication/__init__.robot
*** Variables ***
${LOGIN_URL}      https://example.com/login

*** Keywords ***
Login Flow
    [Arguments]    ${username}    ${password}
    # Implementation

Logout Flow
    [Arguments]    ${username}
    # Implementation
```

## Recursion Prevention

### Circular Reference Detection

```
Error: Circular reference detected!

Call chain:
Login Flow → Process Data → Validate → Login Flow

Cannot create circular dependencies between sub-diagrams.
```

### Maximum Nesting

- **Maximum depth**: 10 levels
- **Warning threshold**: 5 levels

```
Warning: Deep nesting detected (6 levels)

Main → Process → Validate → Check → Verify → Confirm → [Current]

Consider extracting logic into separate sub-diagrams.
```

## Best Practices

### Naming Conventions

```
✓ Good:
- Login Flow
- Process Data
- Validate Input
- Send Notification Email

✗ Bad:
- flow1
- process
- do_stuff
- handleIt
```

### Single Responsibility

Each sub-diagram should have one clear purpose:

```
✓ Good:
- Login Flow        (handles authentication)
- Validate Input    (validates input data)
- Save Results      (saves output)

✗ Bad:
- Do Everything     (does too many things)
- Login And Process (mixes concerns)
```

### Parameter Guidelines

```
✓ Good:
- Keep parameters minimal (≤ 5)
- Use dictionaries for related data
- Provide sensible defaults
- Document each parameter

✗ Bad:
- Too many parameters (> 5)
- No defaults
- Unclear parameter names
```

### Documentation

Every sub-diagram should have:

```robotframework
*** Keywords ***
Login Flow
    [Documentation]    Performs user login with retry logic.
    ...    
    ...    Arguments:
    ...        - username: User's login name
    ...        - password: User's password (secret)
    ...        - url: Login page URL (default: ${URL})
    ...    
    ...    Returns:
    ...        - success: Boolean indicating login status
    ...    
    ...    Example:
    ...        ${ok}=    Login Flow    admin    ${PASSWORD}
    [Arguments]    ${username}    ${password}    ${url}=${URL}
    # Implementation
```

## TypeScript Types

```typescript
interface Diagram {
  id: string;
  name: string;
  type: DiagramType;
  path: string;
  nodes: Node<BlockData>[];
  edges: Edge<ConnectionData>[];
  variables: Variable[];
  parameters?: Parameter[];
  returns?: ReturnVariable[];
  documentation?: string;
  tags?: string[];
}

interface SubDiagramCall extends BlockData {
  type: 'sub-diagram-call';
  diagramId: string;
  parameters: Map<string, string>;  // param name → variable
  returns: Map<string, string>;     // return name → variable
}

interface Parameter {
  name: string;
  type: VariableType;
  defaultValue?: unknown;
  description?: string;
  required: boolean;
}

interface ReturnVariable {
  name: string;
  type: VariableType;
  description?: string;
}

type DiagramType = 'main' | 'sub-diagram' | 'library';
```

## Search and References

### Find References

Right-click on sub-diagram → "Find References":

```
References to "Login Flow":
├── Main Process
│   └── Line 15: Call Login Flow
├── Process Data
│   └── Line 8: Call Login Flow
└── Admin Tasks
    └── Line 3: Call Login Flow

Total: 3 references
```

### Refactoring

When renaming a sub-diagram:

```
Rename "Login Flow" to "Authenticate User"?

This will update:
• 3 sub-diagram call blocks
• 1 resource file
• Project configuration

[Preview Changes] [Rename] [Cancel]
```
