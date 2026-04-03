# Project Management / Управление проектами

[English](#english) | [Русский](#русский)

---

<a name="english"></a>
## English

### Project Concept

A **Project** in RPAForge is a collection of diagrams, variables, resources, and configurations that work together to automate a business process.

```
Project
├── Main Diagram              # Entry point
├── Sub-Diagrams              # Reusable processes
├── Variables                 # Shared data
├── Resources                 # External files
├── Secrets                   # Encrypted credentials
└── Configuration             # Project settings
```

### Project Structure

```
my-rpa-project/
├── rpaforge.json             # Project configuration
├── README.md                 # Documentation
│
├── processes/                # All diagrams
│   ├── main.diagram.json     # Main process (visual)
│   ├── main.robot            # Main process (RF code)
│   │
│   ├── authentication/       # Folder for auth processes
│   │   ├── login.diagram.json
│   │   ├── login.robot
│   │   ├── logout.diagram.json
│   │   └── logout.robot
│   │
│   ├── data-processing/      # Folder for data processes
│   │   ├── validate.diagram.json
│   │   ├── transform.diagram.json
│   │   └── save.diagram.json
│   │
│   └── shared/               # Shared utilities
│       └── utilities.diagram.json
│
├── variables/                # Variable files
│   ├── default.yaml          # Default values
│   ├── development.yaml      # Dev environment
│   ├── staging.yaml          # Staging environment
│   └── production.yaml       # Production environment
│
├── resources/                # External resources
│   ├── selectors/            # UI selectors
│   │   ├── login.json
│   │   └── dashboard.json
│   ├── templates/            # Document templates
│   │   └── report.xlsx
│   └── config/               # Configuration files
│       └── settings.yaml
│
├── secrets/                  # Encrypted credentials
│   ├── default.enc           # Encrypted secrets
│   └── .gitignore            # Never commit secrets
│
├── output/                   # Execution results
│   ├── logs/                 # Execution logs
│   ├── screenshots/          # Error screenshots
│   └── reports/              # Generated reports
│
└── .rpaforge/                # Internal cache
    ├── cache/
    └── temp/
```

### Project Configuration

**rpaforge.json**
```json
{
  "version": "1.0",
  "name": "My RPA Project",
  "description": "Automated invoice processing",
  "author": "RPA Team",
  
  "main": "processes/main.diagram.json",
  
  "diagrams": [
    {
      "id": "main",
      "name": "Main Process",
      "path": "processes/main.diagram.json",
      "type": "main",
      "description": "Entry point for invoice processing"
    },
    {
      "id": "login",
      "name": "Login Flow",
      "path": "processes/authentication/login.diagram.json",
      "type": "sub-diagram",
      "inputs": [
        {"name": "username", "type": "string", "required": true},
        {"name": "password", "type": "secret", "required": true}
      ],
      "outputs": [
        {"name": "success", "type": "boolean"}
      ]
    }
  ],
  
  "variables": {
    "default": "variables/default.yaml",
    "environments": {
      "development": "variables/development.yaml",
      "staging": "variables/staging.yaml",
      "production": "variables/production.yaml"
    }
  },
  
  "secrets": {
    "provider": "local",
    "path": "secrets/default.enc"
  },
  
  "settings": {
    "defaultTimeout": 30000,
    "screenshotOnError": true,
    "logLevel": "INFO",
    "retryAttempts": 3,
    "parallelExecution": false
  },
  
  "libraries": [
    "RPA.Browser",
    "RPA.Excel",
    "RPA.Email"
  ],
  
  "metadata": {
    "created": "2024-01-15T10:00:00Z",
    "modified": "2024-01-20T15:30:00Z",
    "version": "1.2.0"
  }
}
```

### Diagram References

Diagrams can reference other diagrams within the same project:

```typescript
interface DiagramReference {
  diagramId: string;           // Reference to sub-diagram
  diagramName: string;         // Display name
  parameters: ParameterBinding[];
  returns: ReturnBinding[];
}

interface ParameterBinding {
  parameter: string;           // Parameter name in sub-diagram
  value: string | Variable;    // Value or variable to pass
}

interface ReturnBinding {
  output: string;              // Output name from sub-diagram
  variable: string;            // Variable to store result
}
```

### Variable Scopes

```
┌─────────────────────────────────────────────────────────────────┐
│                     Project Variables                            │
│                  (Available everywhere)                          │
├─────────────────────────────────────────────────────────────────┤
│  • URLs and endpoints                                           │
│  • Timeout values                                               │
│  • Configuration constants                                      │
│  • Environment-specific values                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Diagram Variables                            │
│              (Available in current diagram)                      │
├─────────────────────────────────────────────────────────────────┤
│  • Loop counters                                                │
│  • Temporary calculations                                       │
│  • Intermediate results                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Activity Variables                           │
│              (Available in current activity)                     │
├─────────────────────────────────────────────────────────────────┤
│  • Activity outputs                                              │
│  • Retry counters                                               │
│  • Error messages                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Linking Elements

#### 1. Sequential Flow

Connect activities in sequence:

```
Start → Activity 1 → Activity 2 → Activity 3 → End
```

#### 2. Conditional Flow

Branch based on conditions:

```
          ┌─ True ──→ Activity A ─┐
Start → If                        ├─→ End
          └─ False ─→ Activity B ─┘
```

#### 3. Parallel Flow

Execute multiple branches simultaneously:

```
          ┌─ Branch 1 ─→ Activity A ─┐
Start → Parallel                     ├─→ End
          └─ Branch 2 ─→ Activity B ─┘
```

#### 4. Loop Flow

Repeat activities:

```
          ┌──────────────────┐
          │                  │
Start → While → Activity ────┘
          │
          └─→ End
```

#### 5. Error Handling Flow

Handle exceptions:

```
          ┌─ Try ────→ Activity ────┐
Start → Try-Catch                    ├─→ End
          ├─ Catch ──→ Handler ─────┤
          └─ Finally → Cleanup ─────┘
```

### Sub-Diagram Calls

#### Calling a Sub-Diagram

```typescript
// In main diagram
const loginCall: SubDiagramCallActivity = {
  type: 'subdiagram',
  diagramId: 'login',
  diagramName: 'Login Flow',
  parameters: [
    { parameter: 'username', value: '${USERNAME}' },
    { parameter: 'password', value: '${PASSWORD}' }
  ],
  returns: [
    { output: 'success', variable: '${login_success}' }
  ]
};
```

#### Generated Robot Framework Code

```robotframework
*** Settings ***
Resource    processes/authentication/login.robot

*** Tasks ***
Main Process
    ${login_success}=    Login Flow    ${USERNAME}    ${PASSWORD}
    Run Keyword If    not ${login_success}    Fail    Login failed
    
    # Continue with main process
    Process Data    ${input_file}
```

### Resource Management

#### Selector Files

**resources/selectors/login.json**
```json
{
  "login": {
    "username_input": "id=username",
    "password_input": "id=password",
    "login_button": "css=button[type='submit']",
    "error_message": "css=.error-message",
    "welcome_text": "xpath=//h1[contains(text(), 'Welcome')]"
  }
}
```

**Usage in diagram:**
```typescript
{
  "type": "sync",
  "action": "Input Text",
  "arguments": [
    { "name": "locator", "value": "${selectors.login.username_input}" },
    { "name": "text", "value": "${username}" }
  ]
}
```

#### Configuration Files

**resources/config/settings.yaml**
```yaml
browser:
  name: chrome
  headless: true
  window_size: "1920,1080"

timeouts:
  page_load: 30
  element_wait: 10
  script: 5

retry:
  max_attempts: 3
  delay: 2

logging:
  level: INFO
  file: output/logs/${date}.log
```

### Environment Management

#### Switching Environments

```typescript
// Load environment-specific variables
const project = await Project.load('rpaforge.json');
await project.setEnvironment('production');

// Variables from production.yaml override defaults
const url = project.getVariable('API_URL');  // Production URL
```

#### Environment Variables File

**variables/production.yaml**
```yaml
API_URL: "https://api.production.com"
BROWSER: "chrome"
HEADLESS: true
TIMEOUT: 30000
RETRY_ATTEMPTS: 5
```

### Secret Management

#### Storing Secrets

```bash
# Add secret interactively
rpaforge secret add DATABASE_PASSWORD

# Add secret from file
rpaforge secret add API_KEY --from-file api_key.txt

# List secrets
rpaforge secret list
```

#### Using Secrets in Diagrams

```typescript
{
  "type": "sync",
  "action": "Connect to Database",
  "arguments": [
    { "name": "host", "value": "${DB_HOST}" },
    { "name": "user", "value": "${DB_USER}" },
    { "name": "password", "value": "${secret:DATABASE_PASSWORD}" }
  ]
}
```

### Project Operations

#### Create New Project

```bash
rpaforge init my-project
cd my-project
```

#### Add Diagram

```bash
rpaforge diagram create authentication/login
```

#### Add Sub-Diagram

```bash
rpaforge diagram create shared/utilities --type sub-diagram
```

#### Validate Project

```bash
rpaforge validate
```

#### Run Project

```bash
# Run main process
rpaforge run

# Run specific diagram
rpaforge run authentication/login

# Run with environment
rpaforge run --env production
```

#### Export Project

```bash
# Export to Robot Framework
rpaforge export --format robot

# Export to standalone package
rpaforge package --output dist/
```

### Project Templates

**Template Structure:**
```
templates/
├── web-automation/
│   ├── rpaforge.json
│   ├── processes/
│   └── README.md
├── desktop-automation/
│   └── ...
└── data-processing/
    └── ...
```

**Create from Template:**
```bash
rpaforge init my-project --template web-automation
```

### Dependency Management

**rpaforge.json**
```json
{
  "dependencies": {
    "rpaforge-library-excel": "^1.0.0",
    "rpaforge-library-email": "^2.1.0"
  },
  "robotFramework": {
    "SeleniumLibrary": "^6.0.0",
    "RPA.Browser": "^24.0.0"
  }
}
```

---

<a name="русский"></a>
## Русский

### Концепция проекта

**Проект** в RPAForge — это коллекция диаграмм, переменных, ресурсов и конфигураций, работающих вместе для автоматизации бизнес-процесса.

```
Проект
├── Главная диаграмма         # Точка входа
├── Поддиаграммы               # Повторно используемые процессы
├── Переменные                 # Общие данные
├── Ресурсы                    # Внешние файлы
├── Секреты                    # Зашифрованные учётные данные
└── Конфигурация               # Настройки проекта
```

### Структура проекта

```
my-rpa-project/
├── rpaforge.json             # Конфигурация проекта
├── README.md                 # Документация
│
├── processes/                # Все диаграммы
│   ├── main.diagram.json     # Главный процесс (визуальный)
│   ├── main.robot            # Главный процесс (RF код)
│   │
│   ├── authentication/       # Папка для процессов авторизации
│   │   ├── login.diagram.json
│   │   ├── login.robot
│   │   ├── logout.diagram.json
│   │   └── logout.robot
│   │
│   ├── data-processing/      # Папка для процессов обработки данных
│   │   ├── validate.diagram.json
│   │   ├── transform.diagram.json
│   │   └── save.diagram.json
│   │
│   └── shared/               # Общие утилиты
│       └── utilities.diagram.json
│
├── variables/                # Файлы переменных
│   ├── default.yaml          # Значения по умолчанию
│   ├── development.yaml      # Среда разработки
│   ├── staging.yaml          # Тестовая среда
│   └── production.yaml       # Продуктивная среда
│
├── resources/                # Внешние ресурсы
│   ├── selectors/            # UI селекторы
│   │   ├── login.json
│   │   └── dashboard.json
│   ├── templates/            # Шаблоны документов
│   │   └── report.xlsx
│   └── config/               # Файлы конфигурации
│       └── settings.yaml
│
├── secrets/                  # Зашифрованные учётные данные
│   ├── default.enc           # Зашифрованные секреты
│   └── .gitignore            # Никогда не коммитить секреты
│
├── output/                   # Результаты выполнения
│   ├── logs/                 # Логи выполнения
│   ├── screenshots/          # Скриншоты ошибок
│   └── reports/              # Сгенерированные отчёты
│
└── .rpaforge/                # Внутренний кэш
    ├── cache/
    └── temp/
```

### Конфигурация проекта

**rpaforge.json**
```json
{
  "version": "1.0",
  "name": "Мой RPA проект",
  "description": "Автоматизированная обработка счетов",
  "author": "RPA команда",
  
  "main": "processes/main.diagram.json",
  
  "diagrams": [
    {
      "id": "main",
      "name": "Главный процесс",
      "path": "processes/main.diagram.json",
      "type": "main",
      "description": "Точка входа для обработки счетов"
    },
    {
      "id": "login",
      "name": "Процесс входа",
      "path": "processes/authentication/login.diagram.json",
      "type": "sub-diagram",
      "inputs": [
        {"name": "username", "type": "string", "required": true},
        {"name": "password", "type": "secret", "required": true}
      ],
      "outputs": [
        {"name": "success", "type": "boolean"}
      ]
    }
  ],
  
  "variables": {
    "default": "variables/default.yaml",
    "environments": {
      "development": "variables/development.yaml",
      "staging": "variables/staging.yaml",
      "production": "variables/production.yaml"
    }
  },
  
  "secrets": {
    "provider": "local",
    "path": "secrets/default.enc"
  },
  
  "settings": {
    "defaultTimeout": 30000,
    "screenshotOnError": true,
    "logLevel": "INFO",
    "retryAttempts": 3,
    "parallelExecution": false
  },
  
  "libraries": [
    "RPA.Browser",
    "RPA.Excel",
    "RPA.Email"
  ]
}
```

### Связывание элементов

#### 1. Последовательный поток

Соединение активностей последовательно:

```
Старт → Активность 1 → Активность 2 → Активность 3 → Стоп
```

#### 2. Условный поток

Ветвление по условиям:

```
          ┌─ Истина ──→ Активность A ─┐
Старт → Если                          ├─→ Стоп
          └─ Ложь ───→ Активность B ─┘
```

#### 3. Параллельный поток

Одновременное выполнение веток:

```
          ┌─ Ветка 1 ─→ Активность A ─┐
Старт → Параллельно                    ├─→ Стоп
          └─ Ветка 2 ─→ Активность B ─┘
```

#### 4. Циклический поток

Повторение активностей:

```
          ┌──────────────────────┐
          │                      │
Старт → Пока → Активность ───────┘
          │
          └─→ Стоп
```

#### 5. Поток обработки ошибок

Обработка исключений:

```
          ┌─ Try ─────→ Активность ────┐
Старт → Try-Catch                        ├─→ Стоп
          ├─ Catch ───→ Обработчик ─────┤
          └─ Finally ─→ Очистка ────────┘
```

### Вызовы поддиаграмм

#### Вызов поддиаграммы

```typescript
// В главной диаграмме
const loginCall: SubDiagramCallActivity = {
  type: 'subdiagram',
  diagramId: 'login',
  diagramName: 'Процесс входа',
  parameters: [
    { parameter: 'username', value: '${USERNAME}' },
    { parameter: 'password', value: '${PASSWORD}' }
  ],
  returns: [
    { output: 'success', variable: '${login_success}' }
  ]
};
```

#### Сгенерированный код Robot Framework

```robotframework
*** Settings ***
Resource    processes/authentication/login.robot

*** Tasks ***
Главный процесс
    ${login_success}=    Процесс входа    ${USERNAME}    ${PASSWORD}
    Run Keyword If    not ${login_success}    Fail    Ошибка входа
    
    # Продолжить главный процесс
    Обработать данные    ${input_file}
```

### Операции с проектом

#### Создать новый проект

```bash
rpaforge init my-project
cd my-project
```

#### Добавить диаграмму

```bash
rpaforge diagram create authentication/login
```

#### Добавить поддиаграмму

```bash
rpaforge diagram create shared/utilities --type sub-diagram
```

#### Валидация проекта

```bash
rpaforge validate
```

#### Запуск проекта

```bash
# Запустить главный процесс
rpaforge run

# Запустить конкретную диаграмму
rpaforge run authentication/login

# Запустить в среде
rpaforge run --env production
```

### Управление секретами

#### Хранение секретов

```bash
# Добавить секрет интерактивно
rpaforge secret add DATABASE_PASSWORD

# Добавить секрет из файла
rpaforge secret add API_KEY --from-file api_key.txt

# Список секретов
rpaforge secret list
```

#### Использование секретов в диаграммах

```typescript
{
  "type": "sync",
  "action": "Подключиться к базе данных",
  "arguments": [
    { "name": "host", "value": "${DB_HOST}" },
    { "name": "user", "value": "${DB_USER}" },
    { "name": "password", "value": "${secret:DATABASE_PASSWORD}" }
  ]
}
```
