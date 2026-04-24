# Visual Block System

## Overview

RPAForge uses a visual block-based system for designing automation processes. Each block represents an activity or control structure.

## Block Categories

### 1. Flow Control Blocks

| Block | Icon | Color | Activity Type |
|-------|------|-------|-----------------|
| Start | ▶ | Green #22C55E | `*** Tasks ***` section start |
| End | ■ | Red #EF4444 | End of execution |
| If | ◆ | Blue #3B82F6 | `IF ... ELSE ... END` |
| Switch | ⇄ | Blue #3B82F6 | `IF ... ELSE IF ... END` |
| While | ↻ | Purple #8B5CF6 | `WHILE ... END` |
| For Each | ↻ | Purple #8B5CF6 | `FOR ... IN ... END` |
| Parallel | ⋮⋮ | Teal #14B8A6 | `Run Parallel` |
| Retry Scope | ↺ | Orange #F59E0B | `Wait Until Keyword Succeeds` |

### 2. Error Handling Blocks

| Block | Icon | Color | Activity Type |
|-------|------|-------|-----------------|
| Try Catch | ⚠ | Orange #F59E0B | `TRY ... EXCEPT ... FINALLY ... END` |
| Throw | ⚡ | Red #EF4444 | `Fail` |

### 3. Variable Blocks

| Block | Icon | Color | Activity Type |
|-------|------|-------|-----------------|
| Assign | 📝 | Gray #6B7280 | `Set Variable` |
| Get Variable | 📥 | Gray #6B7280 | `Get Variable Value` |
| Set Suite Variable | 🌐 | Gray #6B7280 | `Set Suite Variable` |

### 4. Activity Blocks

Activities from libraries (Web, Desktop, Excel, etc.) have dynamic colors based on category.

## Block Structure

### Basic Block Layout

```
┌─────────────────────────────────────┐
│ [Icon] Block Name              [×]  │  ← Header (colored by category)
├─────────────────────────────────────┤
│                                     │
│  Properties / Content               │  ← Body (white/light gray)
│                                     │
├─────────────────────────────────────┤
│ ○                                  ○│  ← Ports (input/output)
└─────────────────────────────────────┘
```

### TypeScript Interface

```typescript
interface BlockData {
  id: string;
  type: BlockType;
  name: string;
  category: BlockCategory;
  properties: Record<string, unknown>;
  position: { x: number; y: number };
}

type BlockType =
  // Flow Control
  | 'start'
  | 'end'
  | 'if'
  | 'switch'
  | 'while'
  | 'for-each'
  | 'parallel'
  | 'retry-scope'
  // Error Handling
  | 'try-catch'
  | 'throw'
  // Variables
  | 'assign'
  | 'get-variable'
  | 'set-variable'
  // Activities
  | 'activity';

type BlockCategory =
  | 'flow-control'
  | 'error-handling'
  | 'variables'
  | 'web-automation'
  | 'desktop-automation'
  | 'data-operations'
  | 'ocr'
  | 'sub-diagram';
```

## Special Blocks

### Start Block

Entry point for the process. Every diagram must have exactly one Start block.

```
   ╔═════════════════╗
   ║   ▶ START       ║  ← Green border
   ╚═════════╤═══════╝
             │
             ▼
```

**Properties:**
- `processName`: Name of the process
- `description`: Optional description
- `tags`: Optional tags for categorization

**Code Generation:**
```robotframework
*** Tasks ***
Process Name
    # First activity
```

### End Block

Exit point for the process. A diagram can have multiple End blocks.

```
             │
             ▼
   ╔═════════╧═════════╗
   ║   ■ END           ║  ← Red border
   ╚═══════════════════╝
```

**Properties:**
- `status`: PASS or FAIL (default: PASS)
- `message`: Optional exit message

**Code Generation:**
```robotframework
    Log    Process completed
    # End of task
```

### If Block

Conditional branching with true/false paths.

```
             │
             ▼
   ┌─────────────────────────────┐
   │ ◆ IF                        │
   ├─────────────────────────────┤
   │ Condition: ${value} > 0     │
   ├───────────┬─────────────────┤
   │ TRUE  ●   │   ○ FALSE       │
   │           │                 │
   │ [Then]    │    [Else]       │
   └────┬──────┴───────┬─────────┘
        │              │
        └──────┬───────┘
               │
               ▼
```

**Properties:**
- `condition`: Expression
- `thenBranch`: Nested activities for true path
- `elseBranch`: Nested activities for false path

**Code Generation:**
```robotframework
IF    ${value} > 0
    # Then activities
    Log    Value is positive
ELSE
    # Else activities
    Log    Value is not positive
END
```

### While Block

Loop with condition check.

```
             │
             ▼
   ┌─────────────────────────────┐
   │ ↻ WHILE                     │
   ├─────────────────────────────┤
   │ Condition: ${counter} < 10  │
   │ Max: 100 iterations         │
   ├─────────────────────────────┤
   │    ┌─────────────────────┐  │
   │    │   [Loop Body]       │◄─┐
   │    │         │           │  │
   │    └─────────┼───────────┘  │
   └──────────────┼──────────────┘
                  │
                  ▼
```

**Properties:**
- `condition`: Loop condition
- `maxIterations`: Maximum iterations (safety limit)
- `body`: Nested activities

**Code Generation:**
```robotframework
WHILE    ${counter} < 10    limit=100
    # Loop body activities
    ${counter}=    Evaluate    ${counter} + 1
END
```

### For Each Block

Iterate over a collection.

```
             │
             ▼
   ┌─────────────────────────────┐
   │ ↻ FOR EACH                  │
   ├─────────────────────────────┤
   │ Item: ${item}               │
   │ In: @{list}                 │
   ├─────────────────────────────┤
   │    ┌─────────────────────┐  │
   │    │ [Activity with      │  │
   │    │  ${item}]           │  │
   │    └─────────┼───────────┘  │
   └──────────────┼──────────────┘
                  │
                  ▼
```

**Properties:**
- `itemVariable`: Variable name for current item
- `collection`: List variable or expression
- `body`: Nested activities

**Code Generation:**
```robotframework
FOR    ${item}    IN    @{list}
    # Body activities using ${item}
    Log    ${item}
END
```

### Try Catch Block

Error handling with multiple exception types.

```
             │
             ▼
   ┌─────────────────────────────┐
   │ ⚠ TRY CATCH                 │
   ├─────────────────────────────┤
   │ TRY                         │
   │ ┌─────────────────────────┐ │
   │ │   [Nested Activities]   │ │
   │ └─────────────────────────┘ │
   ├─────────────────────────────┤
   │ EXCEPT [type ▼] AS ${err}   │
   │ ┌─────────────────────────┐ │
   │ │   [Handler Activities]  │ │
   │ └─────────────────────────┘ │
   ├─────────────────────────────┤
   │ FINALLY                     │
   │ ┌─────────────────────────┐ │
   │ │   [Cleanup Activities]  │ │
   │ └─────────────────────────┘ │
   └─────────────┬───────────────┘
                 │
                 ▼
```

**Properties:**
- `tryBlock`: Activities to attempt
- `exceptBlocks`: Array of exception handlers
  - `exceptionType`: Exception class name
  - `variable`: Variable for error message
  - `handler`: Activities to handle error
- `finallyBlock`: Cleanup activities (optional)

**Code Generation:**
```robotframework
TRY
    # Try activities
    Open Connection    ${host}
EXCEPT    ConnectionError    AS    ${err}
    # Handler for ConnectionError
    Log    Connection failed: ${err}
EXCEPT    AS    ${err}
    # Handler for all other errors
    Log    Unexpected error: ${err}
FINALLY
    # Always runs
    Close Connection
END
```

### Parallel Block

Execute multiple branches concurrently.

```
             │
             ▼
   ┌─────────────────────────────┐
   │ ⋮⋮ PARALLEL                 │
   ├─────────────────────────────┤
   │ ┌───────┐ ┌───────┐ ┌─────┐ │
   │ │Branch1│ │Branch2│ │Br.3 │ │
   │ │   │   │ │   │   │ │  │  │ │
   │ │   ▼   │ │   ▼   │ │  ▼  │ │
   │ │[Acts] │ │[Acts] │ │[A] │ │
   │ │   │   │ │   │   │ │  │  │ │
   │ └───┼───┘ └───┼───┘ └──┼──┘ │
   └─────┼─────────┼────────┼─────┘
         └────┬────┴────────┘
              │
              ▼
```

**Properties:**
- `branches`: Array of parallel branches
  - `name`: Branch name
  - `activities`: Activities in branch

**Code Generation:**
```robotframework
${results}=    Run Parallel
...    Keyword 1    ${arg1}
...    Keyword 2    ${arg2}
...    Keyword 3    ${arg3}
```

### Sub-Diagram Call Block

Call a reusable sub-diagram.

```
   ┌─────────────────────────────────────┐
   │ 📞 Call: Login Flow                 │
   ├─────────────────────────────────────┤
   │ Inputs:                             │
   │  • username: ${user}               │
   │  • password: ${pass}               │
   ├─────────────────────────────────────┤
   │ Outputs:                            │
   │  • result → ${login_result}        │
   ├─────────────────────────────────────┤
   │ ○                                  ○│
   └─────────────────────────────────────┘
```

**Properties:**
- `diagramId`: Reference to sub-diagram
- `parameters`: Input parameter mapping
- `returns`: Output variable mapping

**Code Generation:**
```robotframework
${login_result}=    Login Flow    ${user}    ${pass}
```

## Port System

### Port Types

```typescript
type PortType =
  | 'input'      // Single input (left side)
  | 'output'     // Single output (right side)
  | 'true'       // True branch output (green)
  | 'false'      // False branch output (red)
  | 'branch'     // Parallel branch output
  | 'merge'      // Multiple inputs merge point
  | 'error';     // Error output (for Try Catch)
```

### Port Positioning

- **Input ports**: Left side of block
- **Output ports**: Right side of block
- **Conditional ports**: Right side, labeled (●T ○F)
- **Nested ports**: Top/Bottom for container blocks

## Connection Styling

| Connection Type | Style | Color | Description |
|----------------|-------|-------|-------------|
| Normal | Solid line | Gray #6B7280 | Default execution flow |
| True | Solid line | Green #22C55E | IF true branch |
| False | Dashed line | Red #EF4444 | IF false branch |
| Error | Dotted line | Orange #F59E0B | Error handling flow |
| Parallel | Double line | Teal #14B8A6 | Parallel execution |

## Color Palette

| Category | Primary Color | Hover Color |
|----------|--------------|-------------|
| Start | #22C55E | #16A34A |
| End | #EF4444 | #DC2626 |
| Flow Control | #3B82F6 | #2563EB |
| Error Handling | #F59E0B | #D97706 |
| Variables | #6B7280 | #4B5563 |
| Web Automation | #10B981 | #059669 |
| Desktop Automation | #8B5CF6 | #7C3AED |
| Data Operations | #14B8A6 | #0D9488 |
| Sub-Diagram | #6366F1 | #4F46E5 |

## Best Practices

### Block Placement

1. Start block at top-left of canvas
2. Flow naturally from top to bottom
3. Keep related blocks close together
4. Use sub-diagrams for complex logic
5. Add comments for clarity

### Nesting Guidelines

- Maximum nesting depth: 5 levels
- Use sub-diagrams for deeper logic
- Keep each diagram focused on one task
- Name sub-diagrams descriptively

### Performance

- Limit blocks per diagram: ~50
- Use parallel blocks for independent operations
- Avoid deeply nested conditionals
- Extract repeated patterns to sub-diagrams
