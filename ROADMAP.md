# RPAForge MVP Roadmap

## Обзор проекта

**Цель**: Создать Open Source RPA Studio - визуальную среду разработки автоматизации на базе Robot Framework.

**Текущий статус**: ~65% MVP (v0.1.0-dev)

**Целевая дата MVP**: Q2 2026

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    RPAForge Studio                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Electron + React UI                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ Designer │ │ Debugger │ │ Console  │            │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │   │
│  │       │            │            │                   │   │
│  │       └────────────┴────────────┘                   │   │
│  │                    │                                │   │
│  │              Zustand Store                          │   │
│  │                    │                                │   │
│  │              Custom Hooks                           │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │ IPC (JSON-RPC)                      │
│  ┌────────────────────┴────────────────────────────────┐   │
│  │              Python Bridge Server                    │   │
│  │                    │                                │   │
│  │              StudioEngine                           │   │
│  │         ┌──────────┼──────────┐                    │   │
│  │         │          │          │                    │   │
│  │    Debugger   Recorder    Executor                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              RPA Libraries                           │   │
│  │  DesktopUI │ WebUI │ Excel │ OCR │ Database │ Creds │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## ЭТАП 1: IPC Infrastructure (HIGH PRIORITY)

**Цель этапа**: Обеспечить коммуникацию между Electron UI и Python Engine.

**Срок**: 2 недели

### Задачи

#### 1.1 Python Bridge Server
- **Файл**: `packages/core/src/rpaforge/bridge/server.py`
- **Описание**: JSON-RPC сервер для IPC между Electron и Python через stdin/stdout
- **Требования**:
  - Асинхронная обработка запросов (asyncio)
  - Поддержка request/response pattern
  - Поддержка event streaming (логи, breakpoints)
  - Обработка ошибок с кодами
- **Формат сообщения**:
  ```json
  {
    "jsonrpc": "2.0",
    "method": "runProcess",
    "params": {"source": "..."},
    "id": 1
  }
  ```
- **Методы API**:
  - `runProcess` - запуск процесса
  - `stopProcess` - остановка
  - `setBreakpoint` - установка брейкпоинта
  - `removeBreakpoint` - удаление брейкпоинта
  - `stepOver/stepInto/stepOut` - пошаговое выполнение
  - `getVariables` - получение переменных
  - `getCallStack` - получение стека вызовов

#### 1.2 Electron Python Bridge Integration
- **Файл**: `packages/studio/electron/python-bridge.ts`
- **Описание**: Интеграция bridge server с Electron main process
- **Требования**:
  - Spawn Python subprocess
  - Управление lifecycle (start/stop/restart)
  - Heartbeat для проверки живучести
  - Reconect при падении

#### 1.3 IPC TypeScript Types
- **Файл**: `packages/studio/src/types/ipc.ts`
- **Описание**: TypeScript типы для IPC сообщений
- **Требования**:
  - Типы для всех request/response
  - Типы для events
  - Типы для errors

---

## ЭТАП 2: State Management (HIGH PRIORITY)

**Цель этапа**: Реализовать глобальное состояние приложения.

**Срок**: 1 неделя

### Задачи

#### 2.1 Process Store
- **Файл**: `packages/studio/src/stores/processStore.ts`
- **Описание**: Zustand store для управления процессом
- **State**:
  ```typescript
  interface ProcessState {
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;
    isRunning: boolean;
    isPaused: boolean;
    // Actions
    addNode: (node: Node) => void;
    removeNode: (id: string) => void;
    updateNode: (id: string, data: Partial<Node>) => void;
    setSelectedNode: (id: string | null) => void;
  }
  ```

#### 2.2 Debugger Store
- **Файл**: `packages/studio/src/stores/debuggerStore.ts`
- **Описание**: Zustand store для состояния отладчика
- **State**:
  ```typescript
  interface DebuggerState {
    breakpoints: Breakpoint[];
    variables: Variable[];
    callStack: CallFrame[];
    currentLine: number | null;
    isStepping: boolean;
    // Actions
    addBreakpoint: (breakpoint: Breakpoint) => void;
    removeBreakpoint: (id: string) => void;
    setVariables: (vars: Variable[]) => void;
    setCallStack: (stack: CallFrame[]) => void;
  }
  ```

#### 2.3 Console Store
- **Файл**: `packages/studio/src/stores/consoleStore.ts`
- **Описание**: Zustand store для вывода консоли
- **State**:
  ```typescript
  interface ConsoleState {
    logs: LogEntry[];
    // Actions
    addLog: (entry: LogEntry) => void;
    clearLogs: () => void;
  }
  ```

---

## ЭТАП 3: Custom Hooks (HIGH PRIORITY)

**Цель этапа**: Создать React hooks для работы с engine.

**Срок**: 1 неделя

### Задачи

#### 3.1 useEngine Hook
- **Файл**: `packages/studio/src/hooks/useEngine.ts`
- **Описание**: Hook для коммуникации с Python engine
- **API**:
  ```typescript
  const {
    isConnected,
    isRunning,
    runProcess,
    stopProcess,
    pauseProcess,
    resumeProcess
  } = useEngine();
  ```

#### 3.2 useDebugger Hook
- **Файл**: `packages/studio/src/hooks/useDebugger.ts`
- **Описание**: Hook для управления отладчиком
- **API**:
  ```typescript
  const {
    breakpoints,
    variables,
    callStack,
    addBreakpoint,
    removeBreakpoint,
    stepOver,
    stepInto,
    stepOut,
    continue
  } = useDebugger();
  ```

#### 3.3 useProcess Hook
- **Файл**: `packages/studio/src/hooks/useProcess.ts`
- **Описание**: Hook для управления процессом на canvas
- **API**:
  ```typescript
  const {
    nodes,
    edges,
    addNode,
    removeNode,
    updateNode,
    connectNodes,
    selectedNode
  } = useProcess();
  ```

---

## ЭТАП 4: Visual Designer (HIGH PRIORITY)

**Цель этапа**: Реализовать визуальный редактор процессов.

**Срок**: 2 недели

### Задачи

#### 4.1 Activity Palette
- **Файл**: `packages/studio/src/components/Designer/ActivityPalette.tsx`
- **Описание**: Панель с доступными активностями (keywords)
- **Требования**:
  - Группировка по библиотекам (DesktopUI, WebUI, Excel, etc.)
  - Поиск по названию
  - Drag-and-drop на canvas
  - Иконки для каждой категории

#### 4.2 Process Canvas
- **Файл**: `packages/studio/src/components/Designer/ProcessCanvas.tsx`
- **Описание**: Основной canvas для редактирования процесса
- **Требования**:
  - React Flow integration
  - Custom nodes для keywords
  - Drag-and-drop из palette
  - Создание связей между nodes
  - Zoom/pan
  - Mini-map
  - Выделение и удаление

#### 4.3 Custom Node Components
- **Файл**: `packages/studio/src/components/Designer/nodes/`
- **Описание**: Custom React Flow nodes для разных типов активностей
- **Типы nodes**:
  - `KeywordNode` - вызов keyword
  - `VariableNode` - установка переменной
  - `ConditionNode` - условие (if/else)
  - `LoopNode` - цикл (for/while)
  - `StartNode` / `EndNode` - начало/конец процесса

#### 4.4 Property Panel
- **Файл**: `packages/studio/src/components/Designer/PropertyPanel.tsx`
- **Описание**: Панель редактирования свойств выбранной активности
- **Требования**:
  - Редактирование аргументов keyword
  - Выбор типа аргумента (string, variable, expression)
  - Таймаут выполнения
  - Continue on error
  - Описание активности

---

## ЭТАП 5: Debugger UI (HIGH PRIORITY)

**Цель этапа**: Реализовать UI для отладки процессов.

**Срок**: 1 неделя

### Задачи

#### 5.1 Variable Panel
- **Файл**: `packages/studio/src/components/Debugger/VariablePanel.tsx`
- **Описание**: Панель просмотра переменных
- **Требования**:
  - Дерево переменных (nested objects)
  - Поиск по переменным
  - Редактирование значений
  - Watch expressions

#### 5.2 Call Stack Panel
- **Файл**: `packages/studio/src/components/Debugger/CallStackPanel.tsx`
- **Описание**: Панель стека вызовов
- **Требования**:
  - Список вызовов
  - Переход к source location
  - Просмотр переменных в контексте

#### 5.3 Console Output
- **Файл**: `packages/studio/src/components/Debugger/ConsoleOutput.tsx`
- **Описание**: Панель вывода логов
- **Требования**:
  - Цветовая индикация по уровню (info, warn, error)
  - Фильтрация по уровню
  - Поиск по логам
  - Autoscroll

#### 5.4 Breakpoint Gutter
- **Файл**: `packages/studio/src/components/Designer/BreakpointGutter.tsx`
- **Описание**: Отображение брейкпоинтов на canvas
- **Требования**:
  - Клик для добавления/удаления
  - Conditional breakpoints (правый клик)
  - Enable/disable toggle

---

## ЭТАП 6: Testing (MEDIUM PRIORITY)

**Цель этапа**: Покрыть код тестами.

**Срок**: 1 неделя

### Задачи

#### 6.1 DesktopUI Library Tests
- **Файл**: `packages/libraries/tests/test_desktopui.py`
- **Описание**: Unit тесты для DesktopUI library
- **Требования**:
  - Mock pywinauto
  - Тесты всех keywords
  - Edge cases

#### 6.2 WebUI Library Tests
- **Файл**: `packages/libraries/tests/test_webui.py`
- **Описание**: Unit тесты для WebUI library
- **Требования**:
  - Mock Playwright
  - Тесты всех keywords
  - Edge cases

#### 6.3 UI Component Tests
- **Файл**: `packages/studio/src/**/*.test.tsx`
- **Описание**: Vitest тесты для React компонентов
- **Требования**:
  - Testing Library
  - Тесты рендеринга
  - Тесты interactions

---

## ЭТАП 7: Additional Libraries (MEDIUM PRIORITY)

**Цель этапа**: Реализовать дополнительные RPA библиотеки.

**Срок**: 2 недели

### Задачи

#### 7.1 Excel Library
- **Файл**: `packages/libraries/src/rpaforge_libraries/Excel/library.py`
- **Описание**: Библиотека для работы с Excel
- **Keywords**:
  - `Open Workbook`
  - `Close Workbook`
  - `Read Cell`
  - `Write Cell`
  - `Read Range`
  - `Write Range`
  - `Create Worksheet`
  - `Save Workbook`
- **Зависимости**: openpyxl>=3.1.5, xlwings>=0.34.0

#### 7.2 OCR Library
- **Файл**: `packages/libraries/src/rpaforge_libraries/OCR/library.py`
- **Описание**: Библиотека для распознавания текста
- **Keywords**:
  - `OCR Text From Image`
  - `OCR Text From Screen`
  - `Find Text On Screen`
  - `Click Text`
- **Зависимости**: pytesseract>=0.3.13, easyocr>=1.7.4, pillow>=11.0.0

#### 7.3 Database Library
- **Файл**: `packages/libraries/src/rpaforge_libraries/Database/library.py`
- **Описание**: Библиотека для работы с БД
- **Keywords**:
  - `Connect To Database`
  - `Disconnect From Database`
  - `Execute SQL`
  - `Query`
  - `Query Single Value`
- **Зависимости**: sqlalchemy>=2.0.38

#### 7.4 Credentials Library
- **Файл**: `packages/libraries/src/rpaforge_libraries/Credentials/library.py`
- **Описание**: Библиотека для безопасного хранения credentials
- **Keywords**:
  - `Store Credential`
  - `Get Credential`
  - `Delete Credential`
  - `List Credentials`
- **Зависимости**: keyring>=25.6.0, cryptography>=45.0.0

---

## ЭТАП 8: Documentation (LOW PRIORITY)

**Цель этапа**: Написать документацию.

**Срок**: 1 неделя

### Задачи

#### 8.1 User Guide
- **Файл**: `docs/user-guide/`
- **Содержание**:
  - Getting Started
  - Designer Guide
  - Debugger Guide
  - Libraries Reference

#### 8.2 API Reference
- **Файл**: `docs/api/`
- **Содержание**:
  - Python API (mkdocstrings)
  - TypeScript API (TypeDoc)
  - IPC Protocol

---

## Зависимости (последние версии)

### Python (pyproject.toml)

```toml
[project]
requires-python = ">=3.10"

dependencies = [
    "robotframework>=7.2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.5",
    "pytest-cov>=6.1.1",
    "pytest-asyncio>=0.26.0",
    "ruff>=0.11.2",
    "mypy>=1.15.0",
    "pre-commit>=4.2.0",
]
desktop = [
    "pywinauto>=0.6.8",
    "uiautomation>=2.0.22",
]
web = [
    "playwright>=1.51.0",
    "pytest-playwright>=0.7.0",
]
ocr = [
    "pytesseract>=0.3.13",
    "easyocr>=1.7.4",
    "pillow>=11.1.0",
]
excel = [
    "openpyxl>=3.1.5",
    "xlwings>=0.34.0",
]
database = [
    "sqlalchemy>=2.0.38",
]
credentials = [
    "keyring>=25.6.0",
    "cryptography>=45.0.0",
]
```

### Node.js (package.json)

```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@reactflow/core": "^11.11.4",
    "@reactflow/controls": "^11.2.17",
    "@reactflow/minimap": "^11.7.17",
    "@reactflow/background": "^11.3.17",
    "zustand": "^5.0.3",
    "monaco-editor": "^0.52.2",
    "@monaco-editor/react": "^4.7.0",
    "@tanstack/react-table": "^8.21.3",
    "react-icons": "^5.5.0"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "vite": "^6.2.3",
    "vitest": "^3.1.1",
    "@testing-library/react": "^16.2.0",
    "electron": "^35.0.3",
    "electron-builder": "^26.0.12",
    "tailwindcss": "^4.1.2",
    "eslint": "^9.23.0",
    "@typescript-eslint/eslint-plugin": "^8.28.0",
    "@typescript-eslint/parser": "^8.28.0"
  }
}
```

---

## Milestones

| Milestone | Этапы | Срок | Критерий готовности |
|-----------|-------|------|---------------------|
| **M1: IPC Ready** | Этап 1 | Неделя 2 | UI может запустить процесс на Python |
| **M2: Basic Editor** | Этапы 2-4 | Неделя 5 | Можно создать процесс drag-and-drop |
| **M3: Debugger** | Этап 5 | Неделя 6 | Можно отлаживать процесс |
| **M4: Test Coverage** | Этап 6 | Неделя 7 | >80% coverage |
| **M5: Full MVP** | Этапы 7-8 | Неделя 9 | Все функции работают |

---

## Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| IPC stability issues | Средняя | Высокое | Robust error handling, reconnect logic |
| Playwright/pywinauto compatibility | Низкая | Среднее | Тестирование на целевых платформах |
| Performance с большими процессами | Средняя | Среднее | Virtualization, lazy loading |
| Electron обновления | Низкая | Низкое | Pin версии, тестировать перед upgrade |

---

## Success Criteria (MVP)

- [x] UI подключается к Python engine
- [x] Можно создать процесс drag-and-drop
- [x] Процесс запускается и выполняется
- [x] Отладчик работает (breakpoints, stepping, variables)
- [x] DesktopUI и WebUI libraries покрыты тестами
- [ ] Документация покрывает основные use cases

## Недавние достижения

### SDK & Designer Parity (Issue #36)
- **Activity Registry**: Auto-discovery из RF библиотек (55 activities)
- **Single Start Invariant**: Enforced на UI и codegen уровнях
- **SDK Activity UI Parity**: Activity Palette получает данные из bridge
- **Code Generator**: Валидация топологии перед генерацией
- **90 tests passing** в packages/core
