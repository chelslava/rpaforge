# Activity Types and SDK / Типы активностей и SDK

[English](#english) | [Русский](#русский)

---

<a name="english"></a>
## English

### Activity Types Overview

All activities in RPAForge are classified into the following types:

| Type | Description | Multiple Inputs | Multiple Outputs | Timeout | Retry | Nested |
|------|-------------|-----------------|------------------|---------|-------|--------|
| **Loop** | Iteration constructs | 1 | 1 | Yes | No | Yes |
| **Condition** | Branching logic | 1 | 2+ | No | No | Yes |
| **Container** | Grouping activities | 1 | 1 | Yes | No | Yes |
| **Sync** | Blocking operations | 1 | 1 | Yes | Yes | No |
| **Async** | Non-blocking operations | 1 | 1 | No | No | No |
| **Error Handler** | Exception handling | 1 | 1 | No | No | Yes |
| **Code** | Python code insertion | 1 | 1 | Yes | No | No |

**Note:** Start and End activities are built-in to the Studio and are not part of the SDK.

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

#### 1. Loop Activities

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

#### 2. Condition Activities

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

#### 3. Container Activities

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

#### 4. Synchronous Activities

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

#### 5. Asynchronous Activities

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

#### 6. Error Handler Activities

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

#### 7. Code Activities

Code activities allow inserting Python code directly into the process.

**Python Code Block**
```typescript
interface CodeActivity {
  type: 'code';
  ports: {
    inputs: [{ id: 'input', type: 'flow' }];
    outputs: [{ id: 'output', type: 'flow' }];
  };
  properties: {
    code: string;              // Python code to execute
    language: 'python';        // Only Python supported
    timeout?: TimeoutConfig;
  };
  nested: false;
}
```

**Usage Example:**
```python
# Code activity can access context variables
result = sum(${numbers})
${total} = result
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

The RPAForge SDK is designed to be extremely simple, leveraging Python dataclasses and Robot Framework integration.

#### Basic Activity (Sync)

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="Click Element",
    type=ActivityType.SYNC,
    category="Web",
    description="Click on a web element",
    icon="🖱",
    params=[
        Param("selector", ParamType.STRING, "CSS Selector", required=True),
        Param("wait", ParamType.INTEGER, "Wait time (ms)", default=5000),
    ],
    has_timeout=True,
    has_retry=True,
    rf_keyword="Click Element",
    rf_library="SeleniumLibrary",
)
class ClickElement:
    def run(self, ctx):
        selector = ctx.get("selector")
        wait = ctx.get("wait", 5000)
        # Robot Framework keyword will be called automatically
        return ctx.output("output", {"clicked": True})
```

#### Built-in Parameters

Every activity automatically has these built-in parameters (based on type):

**SYNC activities:**
- `timeout` (ms) - Maximum execution time
- `retry` - Retry configuration
- `continueOnError` - Continue on failure

**ASYNC activities:**
- No timeout (fire and forget)

**CONTAINER/LOOP/CONDITION activities:**
- `timeout` (ms) - Maximum execution time
- Nested activities support

**CODE activities:**
- `timeout` (ms) - Maximum execution time

#### Container Activity

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="Excel Application",
    type=ActivityType.CONTAINER,
    category="Data",
    icon="📊",
    description="Work with Excel application",
    params=[
        Param("workbook", ParamType.STRING, "Workbook Path"),
        Param("visible", ParamType.BOOLEAN, "Show Window", default=True),
    ],
    has_nested=True,
    has_timeout=True,
    rf_keyword="Open Excel",
    rf_library="ExcelLibrary",
)
class ExcelApplication:
    def run(self, ctx):
        workbook = ctx.get("workbook")
        visible = ctx.get("visible", True)
        # Container manages nested activities automatically
        return ctx.output("output")
```

#### Loop Activity

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="For Each",
    type=ActivityType.LOOP,
    category="Flow Control",
    icon="🔄",
    description="Iterate over collection",
    params=[
        Param("items", ParamType.VARIABLE, "Collection", required=True),
        Param("itemVar", ParamType.STRING, "Item Variable", default="${item}"),
    ],
    has_nested=True,
    has_timeout=True,
    rf_keyword="FOR",
    rf_library="BuiltIn",
)
class ForEach:
    def run(self, ctx):
        items = ctx.get_var(ctx.get("items"))
        item_var = ctx.get("itemVar", "${item}")
        
        for item in items:
            ctx.set_var(item_var, item)
            # Execute nested activities
        
        return ctx.output("output")
```

#### Condition Activity (If)

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="If",
    type=ActivityType.CONDITION,
    category="Flow Control",
    icon="❓",
    description="Conditional branching",
    params=[
        Param("condition", ParamType.EXPRESSION, "Condition", required=True),
    ],
    inputs=[Port("input")],
    outputs=[
        Port("true", label="True"),
        Port("false", label="False"),
    ],
    has_nested=True,
    rf_keyword="Run Keyword If",
    rf_library="BuiltIn",
)
class If:
    def run(self, ctx):
        condition = ctx.get("condition")
        result = ctx.evaluate(condition)
        
        if result:
            return ctx.output("true")
        else:
            return ctx.output("false")
```

#### Error Handler Activity

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="Try Catch",
    type=ActivityType.ERROR_HANDLER,
    category="Error Handling",
    icon="⚠️",
    description="Handle exceptions",
    params=[
        Param("exceptionType", ParamType.STRING, "Exception Type", default="Exception"),
        Param("exceptionVar", ParamType.STRING, "Exception Variable", default="${error}"),
    ],
    has_nested=True,
    rf_keyword="Run Keyword And Ignore Error",
    rf_library="BuiltIn",
)
class TryCatch:
    def run(self, ctx):
        try:
            # Execute try block (nested activities)
            return ctx.output("output")
        except Exception as e:
            exc_type = ctx.get("exceptionType", "Exception")
            exc_var = ctx.get("exceptionVar", "${error}")
            
            if type(e).__name__ == exc_type or exc_type == "Exception":
                ctx.set_var(exc_var, str(e))
                return ctx.output("catch")
            raise
```

#### Code Activity

```python
from rpaforge.sdk import activity, ActivityType, Port, Param, ParamType

@activity(
    name="Python Code",
    type=ActivityType.CODE,
    category="Advanced",
    icon="🐍",
    description="Execute Python code",
    params=[
        Param("code", ParamType.CODE, "Python Code", required=True),
    ],
    has_timeout=True,
)
class PythonCode:
    def run(self, ctx):
        code = ctx.get("code")
        # Execute in context with access to variables
        local_vars = {"ctx": ctx}
        exec(code, {}, local_vars)
        return ctx.output("output")
```

### Activity Registry

```python
from rpaforge.sdk import get_activity, list_activities, list_categories

# Get activity metadata
meta = get_activity("ClickElement")
print(meta.to_dict())

# List all activities
activities = list_activities()
for a in activities:
    print(f"{a.name} ({a.type.value})")

# List by category
web_activities = list_activities(category="Web")

# Get all categories
categories = list_categories()
print(categories)  # ['Web', 'Data', 'Flow Control', ...]
```

### Activity Metadata Schema

```json
{
  "id": "ClickElement",
  "name": "Click Element",
  "type": "sync",
  "category": "Web",
  "description": "Click on a web element",
  "icon": "🖱",
  "ports": {
    "inputs": [{"id": "input", "type": "flow", "label": "input", "required": true}],
    "outputs": [{"id": "output", "type": "flow", "label": "output", "required": true}]
  },
  "params": [
    {"name": "selector", "type": "string", "label": "CSS Selector", "required": true},
    {"name": "wait", "type": "integer", "label": "Wait time (ms)", "default": 5000}
  ],
  "builtin": {
    "timeout": true,
    "retry": true,
    "continueOnError": false,
    "nested": false
  },
  "robotFramework": {
    "keyword": "Click Element",
    "library": "SeleniumLibrary"
  }
}
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

| Тип | Описание | Множественные входы | Множественные выходы | Таймаут | Повтор | Вложенность |
|-----|----------|---------------------|---------------------|---------|--------|-------------|
| **Цикл** | Конструкции итерации | 1 | 1 | Да | Нет | Да |
| **Условие** | Логика ветвления | 1 | 2+ | Нет | Нет | Да |
| **Контейнер** | Группировка активностей | 1 | 1 | Да | Нет | Да |
| **Синхронный** | Блокирующие операции | 1 | 1 | Да | Да | Нет |
| **Асинхронный** | Неблокирующие операции | 1 | 1 | Нет | Нет | Нет |
| **Обработчик ошибок** | Обработка исключений | 1 | 1 | Нет | Нет | Да |
| **Код** | Вставка Python кода | 1 | 1 | Да | Нет | Нет |

**Примечание:** Активности Start и End встроены в Studio и не являются частью SDK.

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

#### 1. Активности цикла

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
