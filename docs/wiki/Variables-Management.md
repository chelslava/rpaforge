# Variables Management

## Overview

RPAForge provides a comprehensive variable management system with global and local scopes.

## Variable Scopes

### Scope Hierarchy

```
┌─────────────────────────────────────────────┐
│            Global Variables                  │
│         (Suite Level - Project Wide)         │
│  • Available everywhere                      │
│  • Defined in *** Variables *** section      │
│  • Can be imported from external files       │
└─────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│            Local Variables                   │
│      (Task/Keyword Level - Current Flow)     │
│  • Available only within current diagram     │
│  • Created during execution                  │
│  • Cleared when diagram completes            │
└─────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│            Parameter Variables               │
│        (Arguments - Sub-Diagram Input)       │
│  • Passed into sub-diagrams                  │
│  • Defined in keyword signature              │
│  • Local to that execution                   │
└─────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│            Return Variables                  │
│        (Output - Sub-Diagram Result)         │
│  • Output from sub-diagrams                  │
│  • Assigned to caller's scope                │
│  • Can be renamed by caller                  │
└─────────────────────────────────────────────┘
```

## Variable Syntax

### Variable Prefixes

| Prefix | Name | Example | Description |
|--------|------|---------|-------------|
| `${}` | Scalar | `${username}` | Single value (string, number, object) |
| `@{}` | List | `@{users}` | List/array of values |
| `&{}` | Dictionary | `&{config}` | Key-value mapping |
| `%{}` | Environment | `%{HOME}` | System environment variable |

### Type System

```typescript
type VariableType =
  | 'string'      // Default - any text value
  | 'integer'     // Whole numbers
  | 'float'       // Decimal numbers
  | 'boolean'     // True/False
  | 'list'        // Array of values
  | 'dictionary'  // Object/Map
  | 'path'        // File system path
  | 'json'        // JSON object
  | 'xml'         // XML document
  | 'secret';     // Encrypted credential
```

## Global Variables

### Definition

Global variables are defined at the project level and available to all diagrams.

```robotframework
*** Variables ***
${URL}              https://example.com
${BROWSER}          chrome
${TIMEOUT}          30
@{CREDENTIALS}      user1    user2    user3
&{CONFIG}           api_endpoint=/api/v1    retry_count=3
```

### Visual Panel

```
┌─────────────────────────────────────┐
│ 🌐 Global Variables                 │
├─────────────────────────────────────┤
│ 📝 ${URL} = "https://example.com"   │
│ 📝 ${BROWSER} = "chrome"            │
│ 📝 ${TIMEOUT} = 30                  │
│ 📋 @{CREDENTIALS} = [user1, ...]    │
│ 📖 &{CONFIG} = {api_endpoint: ...}  │
│                                     │
│ [+ Add Variable]                    │
└─────────────────────────────────────┘
```

### Best Practices

1. **Naming**: Use UPPER_CASE for constants
2. **Grouping**: Group related variables
3. **Documentation**: Add descriptions
4. **External Files**: Use variable files for large sets

```python
# variables.py
"""Project-wide configuration variables."""

# URLs
URL = "https://example.com"
API_URL = "https://api.example.com"

# Browser Settings
BROWSER = "chrome"
HEADLESS = False
TIMEOUT = 30

# Test Data
CREDENTIALS = ["user1", "user2", "user3"]
CONFIG = {
    "api_endpoint": "/api/v1",
    "retry_count": 3,
    "screenshot_dir": "screenshots"
}
```

## Local Variables

### Definition

Local variables exist only within the current diagram execution.

```robotframework
*** Keywords ***
Process User Data
    [Arguments]    ${user_id}
    ${user_data}=    Get User    ${user_id}    # Local variable
    ${processed}=    Transform Data    ${user_data}
    Log    ${processed}    # Available here
    [Return]    ${processed}
# ${user_data} and ${processed} not available here
```

### Scope Rules

1. Created when first assigned
2. Available in current diagram only
3. Not visible to sub-diagrams (unless passed as parameter)
4. Cleared when diagram completes

### Variable Assignment Block

```
   ┌─────────────────────────────────────┐
   │ 📝 Assign Variable                  │
   ├─────────────────────────────────────┤
   │ ${result} =                         │
   │ ┌─────────────────────────────────┐ │
   │ │ ${value1} + ${value2}           │ │
   │ └─────────────────────────────────┘ │
   │                                     │
   │ Type: [String    ▼]                │
   │ Scope: [Local    ▼]                │
   └─────────────────────────────────────┘
```

### Built-in Keywords

| Keyword | Scope | Description |
|---------|-------|-------------|
| `Set Variable` | Current | Create local variable |
| `Set Local Variable` | Current | Explicit local scope |
| `Set Suite Variable` | Suite | Make available globally |
| `Set Global Variable` | Global | Make available everywhere |
| `Set Test Variable` | Test | Available in current test |

## Parameter Variables

### Definition

Parameters are input variables for sub-diagrams.

```robotframework
*** Keywords ***
Login Flow
    [Arguments]    ${username}    ${password}    ${url}=${URL}
    # Use parameters
    Open Browser    ${url}
    Input Text    id=username    ${username}
    Input Text    id=password    ${password}
    [Return]    ${True}
```

### Visual Definition

```
┌─────────────────────────────────────────┐
│ Sub-Diagram: Login Flow                 │
├─────────────────────────────────────────┤
│ 📥 Parameters                           │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Name          Type        Default   │ │
│ │ username      String      (none)    │ │
│ │ password      Secret      (none)    │ │
│ │ url           String      ${URL}    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ Add Parameter]                       │
└─────────────────────────────────────────┘
```

### Parameter Passing

When calling a sub-diagram:

```
   ┌─────────────────────────────────────┐
   │ 📞 Call: Login Flow                 │
   ├─────────────────────────────────────┤
   │ username:  ${user}                  │
   │ password:  ${pass}                  │
   │ url:       ${LOGIN_URL}             │
   │                                     │
   │ Returns:                            │
   │   success → ${login_ok}             │
   └─────────────────────────────────────┘
```

## Return Variables

### Definition

Return variables are outputs from sub-diagrams.

```robotframework
*** Keywords ***
Get User Data
    [Arguments]    ${user_id}
    ${user}=    Query Database    SELECT * FROM users WHERE id=${user_id}
    ${name}=    Set Variable    ${user}[name]
    ${email}=    Set Variable    ${user}[email]
    [Return]    ${name}    ${email}    # Multiple return values
```

### Multiple Return Values

```
┌─────────────────────────────────────────┐
│ Sub-Diagram: Get User Data              │
├─────────────────────────────────────────┤
│ 📤 Return Values                        │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Variable     Type        Description│ │
│ │ name         String      User name  │ │
│ │ email        String      User email │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Capturing Returns

```robotframework
${user_name}    ${user_email}=    Get User Data    ${user_id}
```

## Secret Variables

### Overview

Secrets are encrypted variables for sensitive data (passwords, API keys).

### Definition

```
┌─────────────────────────────────────┐
│ Add Secret Variable                 │
├─────────────────────────────────────┤
│ Name:                               │
│ [password          ]                │
│                                     │
│ Value:                              │
│ [••••••••••        ]   [👁]         │
│                                     │
│ ☑ Encrypt and store securely       │
│                                     │
│ [Generate] [Import] [Save] [Cancel]│
└─────────────────────────────────────┘
```

### Storage

Secrets are stored in encrypted files:

```
project/
├── secrets/
│   ├── default.enc    # Encrypted secrets
│   └── .gitignore     # Never commit secrets
└── rpaforge.json
```

### Usage in RPAForge

```robotframework
*** Settings ***
Library    RPAForge.Credentials

*** Variables ***
${PASSWORD}    %{RPAFORGE_SECRET_password}    # From environment

*** Keywords ***
Login
    ${password}=    Get Secret    password
    Input Text    id=password    ${password}
```

## Variable Editor

### Edit Dialog

```
┌─────────────────────────────────────┐
│ Edit Variable                       │
├─────────────────────────────────────┤
│ Name:                               │
│ [api_endpoint       ]               │
│                                     │
│ Scope:                              │
│ ○ Global (Suite)                    │
│ ● Local (Task/Keyword)              │
│ ○ Parameter                         │
│                                     │
│ Type:                               │
│ [String        ▼]                   │
│                                     │
│ Value:                              │
│ ┌─────────────────────────────────┐ │
│ │ /api/v1                        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Description:                        │
│ ┌─────────────────────────────────┐ │
│ │ API endpoint for the service    │ │
│ └─────────────────────────────────┘ │
│                                     │
│        [Save]           [Cancel]   │
└─────────────────────────────────────┘
```

## Expression Editor

### Inline Expression

Built into assignment blocks with autocomplete:

```
┌─────────────────────────────────────────────────┐
│ ${result} =                                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ ${base_url}/api/${endpoint}?id=${id}       │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Available:                                      │
│ • ${base_url} - "https://example.com"          │
│ • ${endpoint} - "users"                        │
│ • ${id} - 123                                  │
│                                                 │
│ Preview: "https://example.com/api/users?id=123"│
└─────────────────────────────────────────────────┘
```

### Supported Operations

```robotframework
# String concatenation
${full_name}=    Set Variable    ${first} ${last}

# Arithmetic
${total}=    Evaluate    ${price} * ${quantity}

# Boolean
${is_valid}=    Evaluate    ${age} >= 18

# List operations
@{sorted}=    Sort List    ${items}

# Dictionary operations
${value}=    Set Variable    ${config}[api_key]

# Environment
${home}=    Get Environment Variable    HOME
```

## Variable Inspector

### Debug Mode

When debugging, inspect current variable state:

```
┌─────────────────────────────────────┐
│ Variable Inspector          [×]     │
├─────────────────────────────────────┤
│ Execution paused at:                │
│ Line 15: Click Element              │
├─────────────────────────────────────┤
│ 🌐 Global                           │
│   ${URL} = "https://example.com"    │
│   ${BROWSER} = "chrome"             │
│   ${TIMEOUT} = 30                   │
│                                     │
│ 📍 Local                            │
│   ${username} = "admin"             │
│   ${counter} = 3                    │
│   @{elements} = ['btn1', 'btn2']    │
│   &{user} = {name: 'John', ...}     │
│                                     │
│ 📥 Parameters                       │
│   ${input_file} = "data.xlsx"       │
│   ${mode} = "update"                │
│                                     │
│ [Refresh] [Copy All] [Export]      │
└─────────────────────────────────────┘
```

## Best Practices

### Naming Conventions

```robotframework
# ✓ Good - Descriptive, snake_case
${user_name}
${max_retry_count}
${API_BASE_URL}         # Constants in UPPER_CASE
@{user_list}            # List with singular item name
&{config_data}          # Dictionary with descriptive name

# ✗ Bad - Unclear, wrong style
${x}                    # Too short
${userName}             # camelCase (use snake_case)
${data}                 # Too generic
${var1}                 # Numbered variables
```

### Scope Guidelines

| Scope | Use Case | Example |
|-------|----------|---------|
| Global | Configuration, URLs, constants | `${URL}`, `${TIMEOUT}` |
| Local | Loop counters, temp results | `${counter}`, `${result}` |
| Parameter | Sub-diagram inputs | `${user_id}`, `${file_path}` |
| Return | Sub-diagram outputs | `${success}`, `${data}` |

### Type Best Practices

```robotframework
# String (default)
${name}=    Set Variable    John Doe

# Integer
${count}=    Convert To Integer    10

# Float
${price}=    Convert To Number    19.99

# Boolean
${is_ready}=    Set Variable If    ${count} > 0    ${True}    ${False}

# List
@{items}=    Create List    item1    item2    item3

# Dictionary
&{user}=    Create Dictionary    name=John    age=30

# Environment
${home}=    Get Environment Variable    HOME

# JSON
${data}=    Evaluate    json.loads('''{"key": "value"}''')    json
```

### Security Best Practices

1. **Never hardcode secrets** - Use secret variables
2. **Use environment variables** for deployment-specific values
3. **Encrypt sensitive data** - Use Credentials library
4. **Don't log secrets** - Mask in output
5. **Use .gitignore** - Exclude secret files

```robotframework
# ✓ Good
${password}=    Get Secret    password
Log    Password: ******    # Masked

# ✗ Bad
${password}=    Set Variable    MyP@ssw0rd    # Hardcoded!
Log    Password: ${password}    # Exposed!
```

## TypeScript Types

```typescript
interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: VariableScope;
  value: unknown;
  defaultValue?: unknown;
  description?: string;
  isSecret: boolean;
}

interface VariableDefinition {
  name: string;
  type: VariableType;
  scope: 'parameter' | 'return';
  defaultValue?: unknown;
  description?: string;
}

type VariableScope =
  | 'global'     // Suite level
  | 'local'      // Current diagram
  | 'parameter'  // Sub-diagram input
  | 'return';    // Sub-diagram output
```

## Python Integration

### Variable File Generation

```python
# Generated from RPAForge global variables
# variables.py

# URLs
URL = "https://example.com"
API_URL = "https://api.example.com"

# Browser Settings
BROWSER = "chrome"
HEADLESS = False
TIMEOUT = 30

# Test Data
CREDENTIALS = ["user1", "user2", "user3"]

CONFIG = {
    "api_endpoint": "/api/v1",
    "retry_count": 3,
    "screenshot_dir": "screenshots"
}
```

### Runtime Variable Access

```python
from robot.libraries.BuiltIn import BuiltIn

def get_variable_value(name: str, default=None):
    """Get variable value from engine context."""
    builtin = BuiltIn()
    return builtin.get_variable_value(name, default)

def set_variable(name: str, value):
    """Set variable in engine context."""
    builtin = BuiltIn()
    builtin.set_suite_variable(f"${{{name}}}", value)
```
