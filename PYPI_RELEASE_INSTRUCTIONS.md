# PyPI Release Instructions for v0.3.0
# Complete Guide for Windows

## Предварительные требования

1. **Python 3.10+** installed
2. **pip** available

---

## Установка twine (один раз)

```powershell
# Установите twine для текущего пользователя
pip install --user twine
```

**Важно**: Если twine установлен, но не найден в PATH, используйте `python -m twine`:

```powershell
# Проверьте установку
python -m twine --version
```

---

## Опубликовать на PyPI

### 1. Создайте API токен на PyPI

1. Перейдите на https://test.pypi.org/account/api-tokens/
2. Нажмите "Add API token"
3. Выберите "Limited" scope
4. Скопируйте токен (начинается с `pypi-`)

### 2. Загрузите пакеты

**Вариант A: Через python -m twine (РЕКОМЕНДУЕТСЯ)**

```powershell
# Установите переменную окружения с токеном
$env:PYPI_API_TOKEN = "pypi-..."

# Загрузите core
cd D:\Repo\rpaforge\packages\core
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*

# Загрузите libraries
cd D:\Repo\rpaforge\packages\libraries
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*
```

**Вариант B: Добавьте twine в PATH (однократная настройка)**

```powershell
# Добавьте пользовательскую директорию Python в PATH (перезапустите PowerShell после)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\ChelSlava\AppData\Roaming\Python\Python311\Scripts", "User")
```

---

## Для production PyPI (после теста)

Используйте `https://upload.pypi.org/legacy/` вместо `https://test.pypi.org/legacy/`

---

## Проверить публикацию

```powershell
# Установите с test.pypi.org
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple rpaforge-core

# Установите libraries
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple rpaforge-libraries
```

---

## Создать GitHub Release (уже сделано)

https://github.com/chelslava/rpaforge/releases/tag/v0.3.0

---

## Troubleshooting

### "twine not recognized"
```powershell
# Проверьте, установлен ли twine
python -m pip show twine

# Если нет, установите
python -m pip install --user twine

# Используйте через python -m
python -m twine upload ...
```

### "Invalid API token"
- Убедитесь, что токен начинается с `pypi-`
- Проверьте, что токен имеет правильные права доступа (Limited scope)
- Сгенерируйте новый токен и попробуйте снова

### "403 Forbidden"
- Убедитесь, что используете `-u "__token__"` как имя пользователя
- Проверьте, что токен действителен и не истек

### "No files found in dist/*"
```powershell
# Проверьте, что пакеты созданы
ls dist/

# Если нет, соберите их
cd D:\Repo\rpaforge\packages\core
python -m build

cd D:\Repo\rpaforge\packages\libraries
python -m build
```

---

## Пример полной последовательности команд

```powershell
# 1. Установите токен
$env:PYPI_API_TOKEN = "pypi-AgENdGVzdC5weXBpLm9yZwIk..."

# 2. Соберите пакеты (если не собраны)
cd D:\Repo\rpaforge\packages\core
python -m build

cd D:\Repo\rpaforge\packages\libraries
python -m build

# 3. Загрузите core
cd D:\Repo\rpaforge\packages\core
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*

# 4. Загрузите libraries
cd D:\Repo\rpaforge\packages\libraries
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*
```
