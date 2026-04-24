# PyPI Release Instructions for v0.3.0
# Complete Guide for Windows

## Предварительные требования

1. **Python 3.10+** installed
2. **pip** available

---

## Установка twine (один раз)

```powershell
pip install --user twine
```

---

## Опубликовать на PyPI

### 1. Создайте API токен на PyPI

**Важно**: Нужны РАЗНЫЕ токены для test.pypi.org и pypi.org!

#### Для test.pypi.org:
1. Перейдите на https://test.pypi.org/account/api-tokens/
2. Нажмите "Add API token"
3. Выберите "Limited" scope
4. Скопируйте токен (начинается с `pypi-`)

#### Для pypi.org (production - после теста):
1. Перейдите на https://pypi.org/account/api-tokens/
2. Нажмите "Add API token"
3. Выберите "Limited" scope
4. Скопируйте токен

### 2. Загрузите пакеты

**Проверьте, что у вас правильный токен для test.pypi.org:**

```powershell
# Установите переменную окружения с токеном
$env:PYPI_API_TOKEN = "pypi-..."  # Вставьте токен от test.pypi.org

# Проверьте токен (должен начинаться с pypi-)
Write-Host "Token prefix: $env:PYPI_API_TOKEN".Substring(0, 15)
```

**Загрузка:**

```powershell
# Загрузите core
cd D:\Repo\rpaforge\packages\core
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*

# Загрузите libraries
cd D:\Repo\rpaforge\packages\libraries
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/*
```

**Или в одну команду:**

```powershell
# Для core
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-..." dist/rpaforge_core-0.3.0-py3-none-any.whl

# Для libraries
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-..." dist/rpaforge_libraries-0.3.0-py3-none-any.whl
```

---

## Для production PyPI (после теста)

```powershell
# Используйте другой токен от pypi.org
$env:PYPI_API_TOKEN_PROD = "pypi-..."  # Токен от https://pypi.org/account/api-tokens/

python -m twine upload --repository-url https://upload.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN_PROD" dist/*
```

---

## Troubleshooting 403 Forbidden

### Проверьте, что токен правильный

- Токен должен начинаться с `pypi-` (для test.pypi.org)
- Убедитесь, что вы скопировали токен от https://test.pypi.org/account/api-tokens/
- А не от https://pypi.org/account/api-tokens/

### Проверьте, что токен активен

1. Перейдите на https://test.pypi.org/account/api-tokens/
2. Убедитесь, что токен в статусе "Active"
3. Если нет - удалите и создайте новый

### Проверьте область действия токена

- Для test.pypi.org: выберите "Limited" scope
- Убедитесь, что токен разрешает загрузку

### Используйте --verbose для подробной ошибки

```powershell
python -m twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "$env:PYPI_API_TOKEN" dist/* --verbose
```

---

## Проверить публикацию

```powershell
# Установите с test.pypi.org
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple rpaforge-core
```

---

## Создать GitHub Release (уже сделано)

https://github.com/chelslava/rpaforge/releases/tag/v0.3.0
