[🇬🇧 English](README.md)

# RPAForge Studio

RPAForge Studio — десктопное приложение на Electron и React для создания, запуска, отладки и записи RPA-процессов поверх Python-движка RPAForge.

## Быстрый старт

### Требования

- Node.js 20 или 22
- npm 9+
- Python 3.12+
- Пакеты rpaforge-core и rpaforge-libraries, установленные из корня репозитория

```bash
# Из корня репозитория
uv pip install -e packages/core
uv pip install -e packages/libraries

# Из текущего пакета
cd packages/studio
npm ci --include=optional
npm run dev
```

Для запуска упакованной десктопной оболочки:

```bash
npm run electron:dev
```

## Обзор архитектуры

Studio разделена на три основных слоя:

- **Renderer UI**: React, Vite, React Flow, Zustand и TailwindCSS отвечают за визуальный дизайнер процессов, отладчик, рекордер и общую оболочку приложения.
- **Electron shell**: `electron/main.ts` управляет десктопным процессом, жизненным циклом окна, Content Security Policy и валидированными IPC-обработчиками.
- **Python bridge**: `electron/python-bridge.ts` связывает десктопную оболочку с Python-движком RPAForge и потоком выполнения подпроцессов.

Renderer никогда не вызывает Python напрямую. Он отправляет валидированные IPC-запросы через preload-мост, а главный процесс Electron перенаправляет поддерживаемые операции в Python bridge.

## Структура компонентов

```text
src/
  App.tsx                  # Корневое React-приложение
  main.tsx                 # Точка входа renderer
  bridge/                  # Типизированные вспомогательные модули для Electron IPC
  components/              # UI-компоненты, сгруппированные по функциям
  config/                  # Конфигурация frontend
  domain/                  # Доменные объекты и утилиты Studio
  hooks/                   # Кастомные React-хуки
  integration/             # Вспомогательные модули интеграционного слоя
  stores/                  # Zustand-хранилища
  templates/               # Шаблоны процессов и UI
  test/                    # Общие настройки тестов
  types/                   # TypeScript-типы renderer
  utils/                   # Общие утилиты renderer

electron/
  main.ts                  # Главный процесс Electron
  preload.ts               # Безопасный preload-мост renderer
  ipc-validator.ts         # Валидация IPC-пакетов
  python-bridge.ts         # Мост Python-подпроцессов
```

## Тестирование

Запуск проверок из `packages/studio`:

```bash
npm run lint
npm run test
```

Сборка renderer и Electron-бандла:

```bash
npm run build
```

При изменениях, затрагивающих Python bridge или интеграцию с движком, также запускайте Python-тесты из корня репозитория:

```bash
pytest packages/core/tests -v
```

## Устранение неполадок

Если опциональные нативные привязки не загружаются:

1. Удалите `node_modules`.
2. Переустановите через `npm ci --include=optional`.
3. На Windows убедитесь, что установлены Python 3.12+ и Visual Studio Build Tools.

Если десктопная оболочка не может подключиться к Python-движку, убедитесь, что редактируемые Python-пакеты установлены из корня репозитория и что активное Python-окружение совпадает с тем, которое использует Studio.

## Участие в проекте

- Сохраняйте типобезопасность кода renderer, не оставляйте неиспользуемые экспорты.
- Валидируйте IPC-пакеты в `electron/ipc-validator.ts`.
- Добавляйте целевые тесты для нового поведения UI, хранилищ и логики bridge.
- Запускайте lint и релевантные тесты перед открытием pull request.
- Синхронизируйте изменения документации со скриптами пакета и именами папок.
