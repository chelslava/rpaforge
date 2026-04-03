# Best Practices

## Python Best Practices

### Code Style

Follow PEP 8 with the following conventions:

```python
# Use type hints
def process_data(input_file: str, output_dir: str) -> dict[str, Any]:
    """Process data from input file.
    
    :param input_file: Path to input file
    :param output_dir: Output directory path
    :returns: Processing results dictionary
    """
    pass

# Use snake_case for functions and variables
def get_user_data():
    user_name = "John"
    user_age = 30

# Use PascalCase for classes
class DataProcessor:
    pass

# Constants in UPPER_CASE
MAX_RETRY_COUNT = 5
DEFAULT_TIMEOUT = 30

# Use f-strings
message = f"Processing {user_name}, age {user_age}"
```

### Import Order

```python
# 1. Future imports
from __future__ import annotations

# 2. Standard library
import os
import sys
from pathlib import Path

# 3. Third-party
from robot.api import TestSuite
from robot.libraries.BuiltIn import BuiltIn

# 4. First-party
from rpaforge.engine import StudioEngine
from rpaforge_libraries import DesktopUI
```

### Error Handling

```python
# ✓ Good - Specific exceptions
try:
    result = process_file(path)
except FileNotFoundError:
    log_error(f"File not found: {path}")
except PermissionError:
    log_error(f"Permission denied: {path}")
except Exception as e:
    log_error(f"Unexpected error: {e}")
    raise

# ✗ Bad - Catch-all without re-raise
try:
    process_file(path)
except:
    pass  # Silently ignoring errors
```

### Context Managers

```python
# ✓ Good - Use context managers
with open(file_path, 'r') as f:
    content = f.read()

# ✓ Good - Custom context manager
from contextlib import contextmanager

@contextmanager
def browser_session(url):
    browser = open_browser(url)
    try:
        yield browser
    finally:
        browser.close()
```

### Type Hints

```python
from typing import Any, Optional

# Basic types
def get_name() -> str:
    return "John"

# Optional
def find_user(user_id: int) -> Optional[dict]:
    user = query_db(user_id)
    return user if user else None

# Collections
def get_users() -> list[dict[str, Any]]:
    return [{"name": "John", "age": 30}]

# Callable
from typing import Callable

def apply_filter(data: list, predicate: Callable[[Any], bool]) -> list:
    return [item for item in data if predicate(item)]
```

## Robot Framework Best Practices

### Naming Conventions

```robotframework
# Keywords - Title Case, descriptive
Login To Application
Get User Data From Database
Process Excel File
Send Email Notification

# Variables - snake_case
${user_name}
${file_path}
${max_retry_count}

# Constants - UPPER_CASE
${URL}
${BROWSER}
${TIMEOUT}

# Lists - singular name
@{user_list}
@{file_names}

# Dictionaries - descriptive name
&{config_data}
&{user_info}
```

### Keyword Documentation

```robotframework
*** Keywords ***
Process User Data
    [Documentation]    Processes user data from input file.
    ...    
    ...    Processes the input Excel file and generates
    ...    output in the specified directory.
    ...    
    ...    Arguments:
    ...        - file_path: Path to input Excel file
    ...        - output_dir: Directory for output files
    ...        - options: Processing options (optional)
    ...    
    ...    Returns:
    ...        - processed_count: Number of processed records
    ...        - error_count: Number of errors encountered
    ...    
    ...    Example:
    ...        ${count}    ${errors}=    Process User Data
    ...        ...    input.xlsx
    ...        ...    output/
    ...        ...    options=${OPTIONS}
    [Arguments]    ${file_path}    ${output_dir}    &{options}
    # Implementation
    [Return]    ${processed_count}    ${error_count}
```

### Single Responsibility

```robotframework
# ✓ Good - One responsibility per keyword
Login To Application
    Open Browser    ${URL}    ${BROWSER}
    Input Credentials    ${USERNAME}    ${PASSWORD}
    Submit Login Form
    Verify Login Success

Input Credentials
    [Arguments]    ${username}    ${password}
    Input Text    id=username    ${username}
    Input Text    id=password    ${password}

Submit Login Form
    Click Button    id=login

Verify Login Success
    Wait Until Element Is Visible    id=welcome

# ✗ Bad - Multiple responsibilities
Login To Application And Process Data
    Open Browser    ${URL}
    Input Text    id=username    ${USERNAME}
    # ... login code ...
    # ... data processing code ...
```

### Error Handling

```robotframework
*** Keywords ***
Safe File Operation
    [Arguments]    ${file_path}    ${operation}
    [Documentation]    Performs file operation with error handling.
    
    TRY
        ${result}=    Run Keyword    ${operation}    ${file_path}
        Log    Operation successful: ${result}
    EXCEPT    FileNotFoundError
        Log    File not found: ${file_path}    WARN
        ${result}=    Set Variable    ${None}
    EXCEPT    PermissionError
        Log    Permission denied: ${file_path}    ERROR
        Fail    Cannot access file
    FINALLY
        Log    Operation completed
    END
    
    [Return]    ${result}
```

### Wait Strategies

```robotframework
# ✓ Good - Explicit waits
Wait Until Element Is Visible    id=button    timeout=10s
Click Element    id=button

# ✓ Good - Wait with retry
Wait Until Keyword Succeeds    5x    2s    Element Should Be Visible    id=button

# ✗ Bad - Hardcoded sleep
Sleep    5s
Click Element    id=button
```

### Tags

```robotframework
*** Settings ***
Force Tags        rpa    automation
Default Tags      smoke

*** Keywords ***
Login Flow
    [Tags]    authentication    smoke    critical
    # Implementation

Process Data
    [Tags]    data    batch
    # Implementation

Send Notification
    [Tags]    email    notification
    # Implementation
```

## RPAForge Best Practices

### Diagram Organization

```
✓ Good Diagram Structure:
- Clear naming
- Single responsibility
- Reasonable size (20-50 blocks)
- Proper sub-diagram extraction
- Documented purpose

✗ Bad Diagram Structure:
- Unrelated activities
- Too large (> 50 blocks)
- No sub-diagrams
- No documentation
```

### Sub-Diagram Usage

```
✓ Good Use Cases:
- Repeated patterns (login, logout)
- Complex logic (validation, transformation)
- Domain-specific operations (email, database)
- Error handling patterns

✗ Bad Use Cases:
- Single activity
- Only used once
- Too simple
```

### Variable Scope

```
✓ Good:
- Global: Configuration, URLs, constants
- Local: Loop counters, temp results
- Parameter: Sub-diagram inputs
- Return: Sub-diagram outputs

✗ Bad:
- Everything global
- No parameter passing
- Unclear scope
```

### Connection Flow

```
✓ Good:
- Clear left-to-right or top-to-bottom flow
- Minimal crossing lines
- Logical grouping
- Consistent spacing

✗ Bad:
- Chaotic connections
- Many crossing lines
- Inconsistent layout
```

## Security Best Practices

### Credential Management

```robotframework
# ✓ Good - Use secret variables
${password}=    Get Secret    database_password
Connect To Database    ${host}    ${user}    ${password}

# ✗ Bad - Hardcoded credentials
Connect To Database    localhost    admin    password123

# ✓ Good - Environment variables
${api_key}=    Get Environment Variable    API_KEY

# ✗ Bad - In config file (committed)
${API_KEY}    sk-1234567890abcdef
```

### Data Sanitization

```robotframework
# ✓ Good - Validate input
${is_valid}=    Validate Input    ${user_input}
Run Keyword If    not ${is_valid}    Fail    Invalid input

# ✓ Good - Escape special characters
${safe_input}=    Escape String    ${user_input}

# ✗ Bad - Direct use of user input
Execute SQL    SELECT * FROM users WHERE name = '${user_input}'
```

### Logging

```robotframework
# ✓ Good - Mask sensitive data
Log    User logged in: ${username}
Log    Password: ******    # Masked

# ✗ Bad - Log sensitive data
Log    User ${username} logged in with password ${password}
```

## Performance Best Practices

### Parallelization

```robotframework
# ✓ Good - Parallel execution
${results}=    Run Parallel
...    Process User    user1
...    Process User    user2
...    Process User    user3

# ✗ Bad - Sequential when parallel possible
Process User    user1
Process User    user2
Process User    user3
```

### Resource Management

```robotframework
# ✓ Good - Clean up resources
*** Keywords ***
Process File
    [Arguments]    ${file_path}
    [Teardown]    Close Resources
    
    Open File    ${file_path}
    # Process file

Close Resources
    Close File
    Close Browser
```

### Batching

```robotframework
# ✓ Good - Batch operations
${all_users}=    Get All Users
Process Users    ${all_users}

# ✗ Bad - Individual operations
FOR    ${user}    IN    @{users}
    Get User    ${user}
    Process User    ${user}
END
```

## Testing Best Practices

### Test Independence

```robotframework
# ✓ Good - Independent tests
*** Test Cases ***
Test Login
    [Setup]    Open Browser    ${URL}
    Login    ${USER}    ${PASS}
    [Teardown]    Close Browser

Test Logout
    [Setup]    Open Browser    ${URL}
    Login    ${USER}    ${PASS}
    Logout
    [Teardown]    Close Browser

# ✗ Bad - Dependent tests
*** Test Cases ***
Test Login
    Login    ${USER}    ${PASS}

Test Logout
    # Depends on Test Login running first!
    Logout
```

### Assertions

```robotframework
# ✓ Good - Clear assertions
Element Should Be Visible    id=welcome
Element Text Should Be    id=message    Success
Page Should Contain    Welcome, User

# ✗ Bad - Weak assertions
Page Should Not Contain    Error

# ✓ Good - Multiple assertions
Element Should Be Visible    id=header
Element Should Be Visible    id=content
Element Should Be Visible    id=footer
```

### Test Data

```robotframework
# ✓ Good - External test data
*** Variables ***
${TEST_DATA_FILE}    test_data.xlsx

*** Keywords ***
Get Test Data
    ${data}=    Read Excel    ${TEST_DATA_FILE}
    [Return]    ${data}

# ✗ Bad - Hardcoded test data
*** Variables ***
${TEST_USER}    test_user_123
${TEST_PASSWORD}    test_pass_456
${TEST_URL}    https://test.example.com/page1
```

## Documentation Best Practices

### README Structure

```markdown
# Project Name

Brief description of the automation project.

## Prerequisites
- Python 3.10+
- Robot Framework 5.0+
- Required libraries

## Installation
pip install -r requirements.txt

## Usage
robot processes/main.robot

## Configuration
Describe environment variables and config files.

## Structure
project/
├── processes/    # Automation processes
├── variables/    # Variable files
└── tests/        # Test cases
```

### Inline Comments

```robotframework
# ✓ Good - Explain why
# Wait for dynamic content to load before interacting
Wait Until Element Is Visible    id=content

# ✗ Bad - Explain what (obvious)
# Click the button
Click Element    id=button

# ✓ Good - Document complex logic
# Retry up to 5 times with 2 second intervals
# to handle intermittent network issues
Wait Until Keyword Succeeds    5x    2s    Connect To API
```

## Code Review Checklist

### Before Committing

- [ ] All tests pass
- [ ] Code follows style guide
- [ ] Keywords documented
- [ ] No hardcoded credentials
- [ ] Proper error handling
- [ ] Resources cleaned up
- [ ] Logs are appropriate
- [ ] No unnecessary waits

### Before Merging

- [ ] Code reviewed
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] No regression in existing tests
- [ ] Performance acceptable
- [ ] Security considerations addressed
