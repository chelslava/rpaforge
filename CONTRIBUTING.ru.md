[🇬🇧 English](CONTRIBUTING.md)

# Участие в разработке RPAForge

Спасибо за интерес к RPAForge! Этот документ содержит руководства и инструкции для участников проекта.

## Содержание

- [Кодекс поведения](#кодекс-поведения)
- [Начало работы](#начало-работы)
- [Настройка окружения](#настройка-окружения)
- [Структура проекта](#структура-проекта)
- [Стандарты кодирования](#стандарты-кодирования)
- [Правила коммитов](#правила-коммитов)
- [Процесс pull request](#процесс-pull-request)
- [Тестирование](#тестирование)
- [Документация](#документация)

## Кодекс поведения

Проект следует [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Участвуя в проекте, вы обязуетесь соблюдать этот кодекс. О неприемлемом поведении сообщайте мейнтейнерам проекта.

## Начало работы

1. Форкните репозиторий
2. Клонируйте форк локально
3. Создайте ветку для функции
4. Внесите изменения
5. Отправьте pull request

### Соглашение об именовании веток

- `feature/PR-XXX-description` — новые функции
- `fix/PR-XXX-description` — исправления багов
- `docs/description` — изменения документации
- `refactor/PR-XXX-description` — рефакторинг кода
- `test/PR-XXX-description` — добавление/обновление тестов

Пример: `feature/PR-007-desktop-ui-library`

## Настройка окружения

### Требования

- Python 3.10 или выше
- Node.js 18 или выше
- Git
- Make (опционально, для удобных команд)

### Установка

```bash
# Клонируйте форк
git clone https://github.com/YOUR_USERNAME/rpaforge.git
cd rpaforge

# Создайте виртуальное окружение
python -m venv .venv
source .venv/bin/activate  # На Windows: .venv\Scripts\activate

# Установите зависимости разработки
pip install -r requirements-dev.txt

# Установите pre-commit хуки
pre-commit install

# Установите пакеты в редактируемом режиме
pip install -e packages/core
pip install -e packages/libraries

# Установите зависимости Studio UI
cd packages/studio
npm install
```

## Хорошие первые задачи — курируемый список новичкам

Начните с небольшой самостоятельной задачи из списка ниже; у каждой в теле
issue есть критерии приёмки. Актуальное меню — в
[issue #752](https://github.com/chelslava/rpaforge/issues/752), фильтр по метке
[`good first issue`](https://github.com/chelslava/rpaforge/labels/good%20first%20issue).

Забронируйте задачу комментарием «беру эту» — такие PR мы ревьюим в первую очередь.

## Структура проекта

```
rpaforge/
├── packages/
│   ├── core/              # Основной движок (Python)
│   │   ├── src/rpaforge/
│   │   └── tests/
│   ├── libraries/         # RPA-библиотеки (Python)
│   │   ├── src/rpaforge_libraries/
│   │   └── tests/
│   ├── studio/            # Десктопный UI (Electron + React)
│   │   ├── electron/
│   │   └── src/
│   └── orchestrator/      # Control Tower (Python FastAPI)
├── docs/                  # Документация
├── plugins/               # Примеры плагинов
├── examples/              # Примеры скриптов
└── tools/                 # Инструменты разработки
```

## Стандарты кодирования

### Python

Мы следуем соглашениям Python с дополнениями:

- **Стиль**: PEP-8 с длиной строки 88 символов (по умолчанию Black)

```python
# Пример
from typing import Any


class MyLibrary:
    """Пример библиотеки в соответствии с соглашениями RPAForge."""

    def do_something(self, arg: str, optional: int = 0) -> dict[str, Any]:
        """Выполнить действие с переданными аргументами.

        :param arg: Описание аргумента.
        :param optional: Описание опционального аргумента.
        :returns: Словарь с результатами.
        """
        return {"result": arg, "count": optional}
```

### TypeScript/React

- **Стиль**: ESLint + Prettier
- **Компоненты**: Функциональные компоненты с хуками
- **Состояние**: Zustand для глобального состояния
- **Стилизация**: TailwindCSS

```typescript
// Пример компонента
import { useState } from "react";
import { useStore } from "../stores/processStore";

interface ActivityCardProps {
  id: string;
  name: string;
  onSelect: (id: string) => void;
}

export function ActivityCard({ id, name, onSelect }: ActivityCardProps) {
  const [isSelected, setSelected] = useState(false);
  const { activities } = useStore();

  return (
    <div
      className={`p-4 border rounded ${isSelected ? "border-blue-500" : ""}`}
      onClick={() => {
        setSelected(!isSelected);
        onSelect(id);
      }}
    >
      {name}
    </div>
  );
}
```

## Правила коммитов

Мы следуем [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Типы

- `feat`: новая функция
- `fix`: исправление бага
- `docs`: только документация
- `style`: изменения стиля кода (форматирование и т.д.)
- `refactor`: рефакторинг кода
- `test`: добавление/обновление тестов
- `chore`: задачи обслуживания

### Примеры

```
feat(core): add breakpoint condition support

Add support for conditional breakpoints using Python expressions.
The condition is evaluated before stopping execution.

Closes #42
```

```
fix(libraries): correct selector timeout handling

The timeout was not properly converted from string to seconds.
```

## Процесс pull request

1. **Создайте ветку** от `main`, следуя соглашению об именовании
2. **Внесите изменения** с понятными сообщениями коммитов
3. **Добавьте/обновите тесты** для своих изменений
4. **Обновите документацию** при необходимости
5. **Запустите тесты локально**: `make test`
6. **Запустите линтер**: `make lint`
7. **Запушьте ветку** и создайте PR

### Шаблон PR

```markdown
## Описание
[Опишите свои изменения]

## Тип изменения
- [ ] Исправление бага
- [ ] Новая функция
- [ ] Ломающее изменение
- [ ] Обновление документации

## Тестирование
- [ ] Юнит-тесты добавлены/обновлены
- [ ] Интеграционные тесты добавлены/обновлены
- [ ] Ручное тестирование выполнено

## Чек-лист
- [ ] Код соответствует стандартам стиля
- [ ] Самопроверка выполнена
- [ ] Документация обновлена
- [ ] Тесты проходят локально
```

### Процесс ревью

1. Требуется хотя бы одно одобрение
2. Все проверки CI должны пройти
3. Нет конфликтов слияния
4. Squash and merge в `main`

## Тестирование

### Запуск тестов

```bash
# Все тесты
make test

# Только Python-тесты
pytest packages/core/tests
pytest packages/libraries/tests

# С покрытием
pytest --cov=src/rpaforge packages/core/tests

# UI-тесты
cd packages/studio
npm run test
```

### Написание тестов

```python
# Пример Python-теста
import pytest
from rpaforge.engine.executor import StudioEngine


class TestStudioEngine:
    def test_create_process(self):
        engine = StudioEngine()
        process = engine.create_process("Test Process")
        assert process.name == "Test Process"

    def test_run_simple_process(self):
        engine = StudioEngine()
        result = engine.run_string("*** Tasks ***\nTest\n    Log    Hello")
        assert result.suite.tests[0].status == "PASS"
```

## Документация

### Сборка документации

```bash
# Установите зависимости документации
pip install -r requirements-docs.txt

# Локальный сервер
mkdocs serve

# Сборка
mkdocs build
```

### Написание документации

- Используйте Markdown для всей документации
- Следуйте существующей структуре
- Включайте примеры кода
- Обновляйте API-справочник для новых публичных API

## Вопросы?

- Откройте [Discussion](https://github.com/chelslava/rpaforge/discussions)
- Присоединяйтесь к чату сообщества (скоро)

---

Спасибо за вклад в RPAForge!
