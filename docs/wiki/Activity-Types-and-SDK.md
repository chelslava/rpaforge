# Activity Types and SDK / Типы активностей и SDK

[English](#english) | [Русский](#русский)

---

<a name="english"></a>
## English

### Activity Types Overview

All activities in RPAForge are classified into the following types:

| Type | Description | Multiple Inputs | Multiple Outputs | Timeout | Nested |
|------|-------------|-----------------|------------------|---------|--------|
| **Control** | Start/End points | Configurable | Configurable | No | No |
| **Loop** | Iteration constructs | 1 | 1 | Yes | Yes |
| **Condition** | Branching logic | 1 | 2+ | No | Yes |
| **Container** | Grouping activities | 1 | 1 | Yes | Yes |
| **Synchronous** | Blocking operations | 1 | 1 | Yes | No |
| **Asynchronous** | Non-blocking operations | 1 | 1 | No | No |
| **Error Handler** | Exception handling | 1 | 1 | No | Yes |
| **Sub-Diagram** | Reusable processes | 1 | 1 | Yes | No |

### Activity Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Base Activity                             │
├─────────────────────────────────────────────────────────────────┤
│  id: string                                                     │
│  type: ActivityType                                             │
│  name: string                                                   │
│  category: ActivityCategory                                     │
│  description: string                                            │
│  icon: string                                                   │
│  color: string                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ports: PortConfig                                              │
│  ├── inputs: Port[]                                             │
│  └── outputs: Port[]                                            │
├─────────────────────────────────────────────────────────────────┤
│  properties: PropertySchema[]                                   │
│  timeout?: TimeoutConfig                                        │
│  retry?: RetryConfig                                            │
│  onError?: ErrorHandlingConfig                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Activity Types Detail

#### 1. Control Activities

Control activities define process entry and exit points.

**Start Activity**
```typescript
interface StartActivity {
  type: 'control-start';
  ports: {
    inputs: [];  // No inputs
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    processName: string;
    description?: string;
    tags?: string[];
  };
}
```

**End Activity**
```typescript
interface EndActivity {
  type: 'control-end';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [];  // No outputs
  };
  properties: {
    status: 'pass' | 'fail';
    message?: string;
  };
}
```

#### 2. Loop Activities

Loop activities iterate over collections or repeat until condition is met.

**While Loop**
```typescript
interface WhileActivity {
  type: 'loop-while';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    condition: string;
    maxIterations?: number;
    timeout?: TimeoutConfig;
  };
  nested: true;  // Can contain activities
}
```

**For Each Loop**
```typescript
interface ForEachActivity {
  type: 'loop-foreach';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    itemVariable: string;
    collection: string;
    parallel?: boolean;
    timeout?: TimeoutConfig;
  };
  nested: true;
}
```

#### 3. Condition Activities

Condition activities provide branching logic based on expressions.

**If Condition**
```typescript
interface IfActivity {
  type: 'condition-if';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'true', type: 'flow', label: 'True' },
      { id: 'false', type: 'flow', label: 'False' }
    ];
  };
  properties: {
    condition: string;
  };
  nested: true;
  branches: ['true', 'false'];
}
```

**Switch Condition**
```typescript
interface SwitchActivity {
  type: 'condition-switch';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'case1', type: 'flow', label: 'Case 1' },
      { id: 'case2', type: 'flow', label: 'Case 2' },
      { id: 'default', type: 'flow', label: 'Default' }
    ];
  };
  properties: {
    value: string;
    cases: CaseDefinition[];
  };
  nested: true;
  dynamicOutputs: true;  // Outputs can be added/removed
}
```

#### 4. Container Activities

Container activities group related activities with shared context.

**Scope Container**
```typescript
interface ScopeActivity {
  type: 'container-scope';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    name: string;
    timeout?: TimeoutConfig;
    variables?: VariableDefinition[];
  };
  nested: true;
}
```

**Application Container**
```typescript
interface ApplicationActivity {
  type: 'container-application';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    application: 'excel' | 'word' | 'browser' | 'outlook' | 'custom';
    connectionConfig: ConnectionConfig;
    timeout?: TimeoutConfig;
    autoClose: boolean;
  };
  nested: true;
}
```

**Parallel Container**
```typescript
interface ParallelActivity {
  type: 'container-parallel';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    branches: number;  // Number of parallel branches
    synchronize: boolean;  // Wait for all to complete
    timeout?: TimeoutConfig;
  };
  nested: true;
  parallelBranches: true;
}
```

#### 5. Synchronous Activities

Synchronous activities block execution until completion.

**Characteristics:**
- Single input and output
- Configurable timeout
- Retry support
- Error handling options

```typescript
interface SyncActivity {
  type: 'sync';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    action: string;
    arguments: ArgumentDefinition[];
    timeout: TimeoutConfig;
    retry?: RetryConfig;
    continueOnError: boolean;
  };
  nested: false;
}
```

**Timeout Configuration:**
```typescript
interface TimeoutConfig {
  enabled: boolean;
  duration: number;  // milliseconds
  onTimeout: 'error' | 'skip' | 'retry';
}
```

**Retry Configuration:**
```typescript
interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  interval: number;  // milliseconds
  backoff: 'none' | 'linear' | 'exponential';
  retryOn: string[];  // Error types to retry on
}
```

#### 6. Asynchronous Activities

Asynchronous activities don't block execution.

**Characteristics:**
- Single input and output
- No timeout (fire and forget)
- Optional callback support

```typescript
interface AsyncActivity {
  type: 'async';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'output', type: 'flow' },
      { id: 'callback', type: 'event', optional: true }
    ];
  };
  properties: {
    action: string;
    arguments: ArgumentDefinition[];
    waitForCompletion: boolean;
    callbackTimeout?: number;
  };
  nested: false;
}
```

#### 7. Error Handler Activities

Error handler activities manage exceptions.

**Try-Catch**
```typescript
interface TryCatchActivity {
  type: 'error-trycatch';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    tryBlock: Activity[];
    catchBlocks: CatchDefinition[];
    finallyBlock?: Activity[];
  };
  nested: true;
}

interface CatchDefinition {
  id: string;
  exceptionType: string;  // e.g., 'ValueError', 'TimeoutError'
  variable?: string;  // Variable to store exception
  handler: Activity[];
}
```

**Throw**
```typescript
interface ThrowActivity {
  type: 'error-throw';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [];  // No outputs - execution stops
  };
  properties: {
    exceptionType: string;
    message: string;
  };
  nested: false;
}
```

#### 8. Sub-Diagram Activities

Sub-diagram activities call reusable processes.

```typescript
interface SubDiagramActivity {
  type: 'subdiagram';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    diagramId: string;
    diagramName: string;
    parameters: ParameterMapping[];
    returns: ReturnMapping[];
    timeout?: TimeoutConfig;
  };
  nested: false;
}
```

### Port System

#### Port Types

```typescript
type PortType = 
  | 'flow'      // Control flow (execution)
  | 'data'      // Data flow (values)
  | 'event'     // Event output (async)
  | 'error';    // Error output

interface Port {
  id: string;
  type: PortType;
  label?: string;
  required: boolean;
  multiple?: boolean;  // Can accept multiple connections
  dataType?: string;   // For data ports
  position: 'left' | 'right' | 'top' | 'bottom';
}
```

#### Port Configuration

```typescript
interface PortConfig {
  inputs: Port[];
  outputs: Port[];
  dynamic?: {
    inputs?: boolean;   // Can add inputs at runtime
    outputs?: boolean;  // Can add outputs at runtime
  };
}
```

### SDK for Activity Development

#### Activity Decorator

```python
from rpaforge.sdk import activity, ActivityType, Port, Property

@activity(
    type=ActivityType.SYNC,
    name="Click Element",
    category="Web Automation",
    icon="🖱️",
    description="Click on a web element",
    timeout_default=30000,
)
class ClickElement:
    """Click on a web element with optional retry."""
    
    # Define ports
    input_ports = [
        Port(id="input", type="flow", required=True)
    ]
    output_ports = [
        Port(id="output", type="flow", required=True),
        Port(id="not_found", type="flow", required=False, label="Not Found")
    ]
    
    # Define properties
    properties = [
        Property(
            name="selector",
            type="string",
            required=True,
            description="CSS selector or XPath",
        ),
        Property(
            name="wait_time",
            type="number",
            default=5000,
            description="Time to wait for element",
        ),
        Property(
            name="retry_count",
            type="number",
            default=3,
            description="Number of retry attempts",
        ),
    ]
    
    def execute(self, context):
        """Execute the activity."""
        selector = context.get_property("selector")
        wait_time = context.get_property("wait_time")
        retry_count = context.get_property("retry_count")
        
        for attempt in range(retry_count):
            try:
                element = context.wait_for_element(selector, wait_time)
                element.click()
                return context.output("output")
            except ElementNotFoundError:
                if attempt == retry_count - 1:
                    return context.output("not_found")
                continue
        
        return context.output("output")
```

#### Container Activity SDK

```python
from rpaforge.sdk import ContainerActivity, ActivityType, Port, Property

@activity(
    type=ActivityType.CONTAINER,
    name="Excel Application",
    category="Data Operations",
    icon="📊",
    description="Work with Excel application",
)
class ExcelApplication(ContainerActivity):
    """Container for Excel operations."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [Port(id="output", type="flow")]
    
    properties = [
        Property(
            name="workbook_path",
            type="string",
            description="Path to Excel workbook",
        ),
        Property(
            name="visible",
            type="boolean",
            default=True,
            description="Show Excel window",
        ),
        Property(
            name="auto_close",
            type="boolean",
            default=True,
            description="Close Excel when done",
        ),
    ]
    
    def enter(self, context):
        """Called when entering the container."""
        workbook_path = context.get_property("workbook_path")
        visible = context.get_property("visible")
        
        excel = context.create_excel_instance(visible=visible)
        if workbook_path:
            excel.open(workbook_path)
        
        context.set_state("excel_instance", excel)
        return True
    
    def exit(self, context):
        """Called when exiting the container."""
        excel = context.get_state("excel_instance")
        
        if context.get_property("auto_close") and excel:
            excel.close()
        
        return True
```

#### Loop Activity SDK

```python
from rpaforge.sdk import LoopActivity, ActivityType, Port, Property

@activity(
    type=ActivityType.LOOP,
    name="For Each Row",
    category="Data Operations",
    icon="🔄",
    description="Iterate over table rows",
)
class ForEachRow(LoopActivity):
    """Iterate over each row in a data table."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [Port(id="output", type="flow")]
    
    properties = [
        Property(
            name="data_source",
            type="variable",
            required=True,
            description="Variable containing data table",
        ),
        Property(
            name="row_variable",
            type="string",
            default="${row}",
            description="Variable for current row",
        ),
        Property(
            name="index_variable",
            type="string",
            default="${index}",
            description="Variable for row index",
        ),
    ]
    
    def get_iterations(self, context):
        """Return number of iterations."""
        data = context.get_variable(context.get_property("data_source"))
        return len(data) if data else 0
    
    def before_iteration(self, context, index):
        """Called before each iteration."""
        data = context.get_variable(context.get_property("data_source"))
        row_variable = context.get_property("row_variable")
        index_variable = context.get_property("index_variable")
        
        context.set_variable(row_variable, data[index])
        context.set_variable(index_variable, index)
        
        return True
    
    def after_iteration(self, context, index):
        """Called after each iteration."""
        return True
```

#### Condition Activity SDK

```python
from rpaforge.sdk import ConditionActivity, ActivityType, Port, Property

@activity(
    type=ActivityType.CONDITION,
    name="Switch",
    category="Flow Control",
    icon="⇄",
    description="Multi-way branch based on value",
)
class SwitchActivity(ConditionActivity):
    """Switch statement for multiple branches."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [
        Port(id="default", type="flow", label="Default")
    ]  # Dynamic outputs added at runtime
    
    properties = [
        Property(
            name="value",
            type="expression",
            required=True,
            description="Value to switch on",
        ),
        Property(
            name="cases",
            type="array",
            default=[],
            description="Case definitions",
            schema={
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string"},
                        "label": {"type": "string"},
                    }
                }
            }
        ),
    ]
    
    def get_branches(self, context):
        """Return available output branches."""
        cases = context.get_property("cases")
        branches = [{"id": f"case_{i}", "label": case["label"]} 
                   for i, case in enumerate(cases)]
        branches.append({"id": "default", "label": "Default"})
        return branches
    
    def evaluate(self, context):
        """Evaluate and return branch to take."""
        value = context.evaluate(context.get_property("value"))
        cases = context.get_property("cases")
        
        for i, case in enumerate(cases):
            if str(value) == str(case["value"]):
                return f"case_{i}"
        
        return "default"
```

#### Error Handler Activity SDK

```python
from rpaforge.sdk import ErrorHandlerActivity, ActivityType, Port, Property

@activity(
    type=ActivityType.ERROR_HANDLER,
    name="Try Catch",
    category="Error Handling",
    icon="⚠️",
    description="Handle exceptions gracefully",
)
class TryCatchActivity(ErrorHandlerActivity):
    """Try-catch-finally block."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [Port(id="output", type="flow")]
    
    properties = [
        Property(
            name="catch_blocks",
            type="array",
            default=[],
            description="Exception handlers",
            schema={
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "exception_type": {"type": "string"},
                        "variable": {"type": "string"},
                    }
                }
            }
        ),
    ]
    
    def get_try_block(self, context):
        """Return activities for try block."""
        return context.get_nested_activities("try")
    
    def get_catch_blocks(self, context):
        """Return exception handlers."""
        return context.get_property("catch_blocks")
    
    def get_finally_block(self, context):
        """Return activities for finally block."""
        return context.get_nested_activities("finally")
    
    def on_exception(self, context, exception):
        """Handle exception and return matching catch block."""
        catch_blocks = context.get_property("catch_blocks")
        
        for i, catch in enumerate(catch_blocks):
            if self.matches_exception(exception, catch["exception_type"]):
                if catch.get("variable"):
                    context.set_variable(catch["variable"], str(exception))
                return f"catch_{i}"
        
        # Re-raise if no matching catch
        raise exception
```

#### Async Activity SDK

```python
from rpaforge.sdk import AsyncActivity, ActivityType, Port, Property
import asyncio

@activity(
    type=ActivityType.ASYNC,
    name="Run Process",
    category="System",
    icon="▶️",
    description="Run external process asynchronously",
)
class RunProcess(AsyncActivity):
    """Run an external process."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [
        Port(id="output", type="flow"),
        Port(id="callback", type="event", optional=True)
    ]
    
    properties = [
        Property(
            name="command",
            type="string",
            required=True,
            description="Command to execute",
        ),
        Property(
            name="arguments",
            type="array",
            default=[],
            description="Command arguments",
        ),
        Property(
            name="wait_for_completion",
            type="boolean",
            default=False,
            description="Wait for process to complete",
        ),
    ]
    
    async def execute_async(self, context):
        """Execute asynchronously."""
        command = context.get_property("command")
        args = context.get_property("arguments")
        wait = context.get_property("wait_for_completion")
        
        process = await asyncio.create_subprocess_exec(
            command, *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        if wait:
            stdout, stderr = await process.communicate()
            context.set_variable("${stdout}", stdout.decode())
            context.set_variable("${stderr}", stderr.decode())
            context.set_variable("${exit_code}", process.returncode)
        else:
            context.set_variable("${pid}", process.pid)
        
        return context.output("output")
```

### Activity Registration

```python
from rpaforge.sdk import ActivityRegistry

# Register activities
registry = ActivityRegistry()

registry.register(ClickElement)
registry.register(ExcelApplication)
registry.register(ForEachRow)
registry.register(SwitchActivity)
registry.register(TryCatchActivity)
registry.register(RunProcess)

# Get activity metadata
metadata = registry.get_metadata("ClickElement")
print(metadata.to_dict())

# List all activities by category
for category in registry.get_categories():
    activities = registry.get_by_category(category)
    print(f"{category}: {[a.name for a in activities]}")
```

### Activity Metadata Schema

```typescript
interface ActivityMetadata {
  id: string;
  type: ActivityType;
  name: string;
  category: string;
  icon: string;
  description: string;
  version: string;
  
  ports: {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    dynamic?: DynamicPortConfig;
  };
  
  properties: PropertyDefinition[];
  
  execution: {
    timeout: TimeoutConfig;
    retry: RetryConfig;
    continueOnError: boolean;
  };
  
  validation: ValidationRule[];
  
  robotFramework: {
    keyword: string;
    library: string;
    arguments: string[];
    documentation: string;
  };
}
```

---

<a name="русский"></a>
## Русский

### Обзор типов активностей

Все активности в RPAForge классифицируются по следующим типам:

| Тип | Описание | Множественные входы | Множественные выходы | Таймаут | Вложенность |
|-----|----------|---------------------|---------------------|---------|-------------|
| **Управление** | Точки старта/останова | Настраивается | Настраивается | Нет | Нет |
| **Цикл** | Конструкции итерации | 1 | 1 | Да | Да |
| **Условие** | Логика ветвления | 1 | 2+ | Нет | Да |
| **Контейнер** | Группировка активностей | 1 | 1 | Да | Да |
| **Синхронный** | Блокирующие операции | 1 | 1 | Да | Нет |
| **Асинхронный** | Неблокирующие операции | 1 | 1 | Нет | Нет |
| **Обработчик ошибок** | Обработка исключений | 1 | 1 | Нет | Да |
| **Поддиаграмма** | Повторно используемые процессы | 1 | 1 | Да | Нет |

### Архитектура активности

```
┌─────────────────────────────────────────────────────────────────┐
│                     Базовая активность                           │
├─────────────────────────────────────────────────────────────────┤
│  id: string                          // Идентификатор           │
│  type: ActivityType                  // Тип активности          │
│  name: string                        // Название                │
│  category: ActivityCategory          // Категория               │
│  description: string                 // Описание                │
│  icon: string                        // Иконка                  │
│  color: string                       // Цвет                    │
├─────────────────────────────────────────────────────────────────┤
│  ports: PortConfig                   // Конфигурация портов     │
│  ├── inputs: Port[]                  // Входные порты           │
│  └── outputs: Port[]                 // Выходные порты          │
├─────────────────────────────────────────────────────────────────┤
│  properties: PropertySchema[]        // Свойства                │
│  timeout?: TimeoutConfig             // Таймаут                 │
│  retry?: RetryConfig                 // Повторные попытки       │
│  onError?: ErrorHandlingConfig       // Обработка ошибок        │
└─────────────────────────────────────────────────────────────────┘
```

### Детали типов активностей

#### 1. Активности управления

Определяют точки входа и выхода процесса.

**Старт**
```typescript
interface StartActivity {
  type: 'control-start';
  ports: {
    inputs: [];  // Нет входов
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    processName: string;
    description?: string;
    tags?: string[];
  };
}
```

**Стоп**
```typescript
interface EndActivity {
  type: 'control-end';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [];  // Нет выходов
  };
  properties: {
    status: 'pass' | 'fail';
    message?: string;
  };
}
```

#### 2. Активности цикла

Выполняют итерацию по коллекциям или повторяют до выполнения условия.

**Цикл While**
```typescript
interface WhileActivity {
  type: 'loop-while';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    condition: string;              // Условие продолжения
    maxIterations?: number;         // Максимум итераций
    timeout?: TimeoutConfig;        // Таймаут выполнения
  };
  nested: true;                     // Может содержать активности
}
```

**Цикл For Each**
```typescript
interface ForEachActivity {
  type: 'loop-foreach';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    itemVariable: string;           // Переменная элемента
    collection: string;             // Коллекция для итерации
    parallel?: boolean;             // Параллельное выполнение
    timeout?: TimeoutConfig;
  };
  nested: true;
}
```

#### 3. Активности условия

Обеспечивают логику ветвления на основе выражений.

**Условие If**
```typescript
interface IfActivity {
  type: 'condition-if';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'true', type: 'flow', label: 'Истина' },
      { id: 'false', type: 'flow', label: 'Ложь' }
    ];
  };
  properties: {
    condition: string;              // Условное выражение
  };
  nested: true;
  branches: ['true', 'false'];
}
```

**Переключатель Switch**
```typescript
interface SwitchActivity {
  type: 'condition-switch';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'case1', type: 'flow', label: 'Вариант 1' },
      { id: 'case2', type: 'flow', label: 'Вариант 2' },
      { id: 'default', type: 'flow', label: 'По умолчанию' }
    ];
  };
  properties: {
    value: string;                  // Значение для сравнения
    cases: CaseDefinition[];        // Определения вариантов
  };
  nested: true;
  dynamicOutputs: true;             // Выходы можно добавлять/удалять
}
```

#### 4. Активности-контейнеры

Группируют связанные активности с общим контекстом.

**Контейнер области видимости**
```typescript
interface ScopeActivity {
  type: 'container-scope';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    name: string;
    timeout?: TimeoutConfig;
    variables?: VariableDefinition[];
  };
  nested: true;
}
```

**Контейнер приложения**
```typescript
interface ApplicationActivity {
  type: 'container-application';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    application: 'excel' | 'word' | 'browser' | 'outlook' | 'custom';
    connectionConfig: ConnectionConfig;
    timeout?: TimeoutConfig;
    autoClose: boolean;             // Автозакрытие при завершении
  };
  nested: true;
}
```

**Параллельный контейнер**
```typescript
interface ParallelActivity {
  type: 'container-parallel';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    branches: number;               // Количество параллельных веток
    synchronize: boolean;           // Ждать завершения всех
    timeout?: TimeoutConfig;
  };
  nested: true;
  parallelBranches: true;
}
```

#### 5. Синхронные активности

Блокируют выполнение до завершения.

**Характеристики:**
- Один вход и выход
- Настраиваемый таймаут
- Поддержка повторных попыток
- Опции обработки ошибок

```typescript
interface SyncActivity {
  type: 'sync';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    action: string;
    arguments: ArgumentDefinition[];
    timeout: TimeoutConfig;
    retry?: RetryConfig;
    continueOnError: boolean;
  };
  nested: false;
}
```

**Конфигурация таймаута:**
```typescript
interface TimeoutConfig {
  enabled: boolean;
  duration: number;                 // миллисекунды
  onTimeout: 'error' | 'skip' | 'retry';
}
```

**Конфигурация повторных попыток:**
```typescript
interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;              // Максимум попыток
  interval: number;                 // Интервал в мс
  backoff: 'none' | 'linear' | 'exponential';
  retryOn: string[];                // Типы ошибок для повтора
}
```

#### 6. Асинхронные активности

Не блокируют выполнение.

**Характеристики:**
- Один вход и выход
- Без таймаута (fire and forget)
- Опциональная поддержка обратного вызова

```typescript
interface AsyncActivity {
  type: 'async';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [
      { id: 'output', type: 'flow' },
      { id: 'callback', type: 'event', optional: true }
    ];
  };
  properties: {
    action: string;
    arguments: ArgumentDefinition[];
    waitForCompletion: boolean;
    callbackTimeout?: number;
  };
  nested: false;
}
```

#### 7. Активности обработки ошибок

Управляют исключениями.

**Try-Catch**
```typescript
interface TryCatchActivity {
  type: 'error-trycatch';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    tryBlock: Activity[];            // Активности блока try
    catchBlocks: CatchDefinition[];  // Определения catch
    finallyBlock?: Activity[];       // Активности блока finally
  };
  nested: true;
}

interface CatchDefinition {
  id: string;
  exceptionType: string;            // например, 'ValueError', 'TimeoutError'
  variable?: string;                // Переменная для хранения исключения
  handler: Activity[];
}
```

**Выброс исключения**
```typescript
interface ThrowActivity {
  type: 'error-throw';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [];                    // Нет выходов - выполнение останавливается
  };
  properties: {
    exceptionType: string;
    message: string;
  };
  nested: false;
}
```

#### 8. Активности поддиаграммы

Вызывают повторно используемые процессы.

```typescript
interface SubDiagramActivity {
  type: 'subdiagram';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    diagramId: string;
    diagramName: string;
    parameters: ParameterMapping[];
    returns: ReturnMapping[];
    timeout?: TimeoutConfig;
  };
  nested: false;
}
```

### Система портов

#### Типы портов

```typescript
type PortType = 
  | 'flow'      // Поток управления (выполнение)
  | 'data'      // Поток данных (значения)
  | 'event'     // Выход события (async)
  | 'error';    // Выход ошибки

interface Port {
  id: string;
  type: PortType;
  label?: string;
  required: boolean;
  multiple?: boolean;              // Может принимать несколько соединений
  dataType?: string;               // Для портов данных
  position: 'left' | 'right' | 'top' | 'bottom';
}
```

### SDK для разработки активностей

#### Декоратор активности

```python
from rpaforge.sdk import activity, ActivityType, Port, Property

@activity(
    type=ActivityType.SYNC,
    name="Нажать элемент",
    category="Веб автоматизация",
    icon="🖱️",
    description="Нажать на веб элемент",
    timeout_default=30000,
)
class ClickElement:
    """Нажать на веб элемент с опциональным повтором."""
    
    # Определить порты
    input_ports = [
        Port(id="input", type="flow", required=True)
    ]
    output_ports = [
        Port(id="output", type="flow", required=True),
        Port(id="not_found", type="flow", required=False, label="Не найден")
    ]
    
    # Определить свойства
    properties = [
        Property(
            name="selector",
            type="string",
            required=True,
            description="CSS селектор или XPath",
        ),
        Property(
            name="wait_time",
            type="number",
            default=5000,
            description="Время ожидания элемента",
        ),
        Property(
            name="retry_count",
            type="number",
            default=3,
            description="Количество попыток повтора",
        ),
    ]
    
    def execute(self, context):
        """Выполнить активность."""
        selector = context.get_property("selector")
        wait_time = context.get_property("wait_time")
        retry_count = context.get_property("retry_count")
        
        for attempt in range(retry_count):
            try:
                element = context.wait_for_element(selector, wait_time)
                element.click()
                return context.output("output")
            except ElementNotFoundError:
                if attempt == retry_count - 1:
                    return context.output("not_found")
                continue
        
        return context.output("output")
```

#### SDK активности-контейнера

```python
from rpaforge.sdk import ContainerActivity, ActivityType, Port, Property

@activity(
    type=ActivityType.CONTAINER,
    name="Приложение Excel",
    category="Операции с данными",
    icon="📊",
    description="Работа с приложением Excel",
)
class ExcelApplication(ContainerActivity):
    """Контейнер для операций с Excel."""
    
    input_ports = [Port(id="input", type="flow")]
    output_ports = [Port(id="output", type="flow")]
    
    properties = [
        Property(
            name="workbook_path",
            type="string",
            description="Путь к книге Excel",
        ),
        Property(
            name="visible",
            type="boolean",
            default=True,
            description="Показать окно Excel",
        ),
        Property(
            name="auto_close",
            type="boolean",
            default=True,
            description="Закрыть Excel при завершении",
        ),
    ]
    
    def enter(self, context):
        """Вызывается при входе в контейнер."""
        workbook_path = context.get_property("workbook_path")
        visible = context.get_property("visible")
        
        excel = context.create_excel_instance(visible=visible)
        if workbook_path:
            excel.open(workbook_path)
        
        context.set_state("excel_instance", excel)
        return True
    
    def exit(self, context):
        """Вызывается при выходе из контейнера."""
        excel = context.get_state("excel_instance")
        
        if context.get_property("auto_close") and excel:
            excel.close()
        
        return True
```

### Регистрация активности

```python
from rpaforge.sdk import ActivityRegistry

# Зарегистрировать активности
registry = ActivityRegistry()

registry.register(ClickElement)
registry.register(ExcelApplication)
registry.register(ForEachRow)
registry.register(SwitchActivity)
registry.register(TryCatchActivity)
registry.register(RunProcess)

# Получить метаданные активности
metadata = registry.get_metadata("ClickElement")
print(metadata.to_dict())

# Список всех активностей по категориям
for category in registry.get_categories():
    activities = registry.get_by_category(category)
    print(f"{category}: {[a.name for a in activities]}")
```
