# Headless CLI

Запускайте сохранённый `.process`, экспортированный проект `.rpaforge` или
папку проекта без запуска Electron:

```bash
rpaforge run ./processes/invoice.process
rpaforge run ./project.rpaforge --diagram main --json
rpaforge run ./project-folder --var environment=ci
```

Обычные параметры передаются через `--var NAME=VALUE`. Значения, похожие на
JSON, получают соответствующий тип (`true`, `42`, `"text"`), остальные остаются
строками. Секреты читаются из окружения через `--secret-env NAME=ENV`:

```bash
RPA_TOKEN="..." rpaforge run ./invoice.process --secret-env token=RPA_TOKEN --json
```

Секретные значения не попадают в JSON-результат и метаданные аудита. JSON
содержит `run_id`, `audit_path`, `status` и длительность. Стабильные коды выхода:
`0` успех, `1` ошибка выполнения, `2` ошибка валидации, `3` отмена или timeout,
`4` ошибка конфигурации/входных данных.

Для ограничения времени используйте `--timeout SECONDS`. Сигналы `SIGINT` и
`SIGTERM` запускают тот же путь отмены и освобождают принадлежащие процессу
worker-процессы.

В CI проверяйте JSON-статус и используйте код выхода команды. Для Windows Task
Scheduler укажите установленный `rpaforge.exe`, путь к процессу и `--json`; для
cron запускайте ту же команду из каталога проекта и сохраняйте JSON как артефакт.

[🇬🇧 English](headless-cli.md)
