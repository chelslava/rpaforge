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

Если `pip` не найден:
```powershell
# Используйте python -m pip
python -m pip install --user twine
```

---

## Опубликовать на PyPI

### 1. Создайте API токен на PyPI

1. Перейдите на https://test.pypi.org/account/api-tokens/
2. Нажмите "Add API token"
3. Выберите "Limited" scope
4. Скопируйте токен (начинается с `pypi-`)

### 2. Загрузите пакеты

```powershell
# Установите переменную окружения с токеном
$env:TWINE_PASSWORD = "pypi-..."

# Укажите пользователя (обязательно)
$env:TWINE_USERNAME = "__token__"

# Загрузите core
cd D:\Repo\rpaforge\packages\core
twine upload --repository-url https://test.pypi.org/legacy/ dist/*

# Загрузите libraries
cd D:\Repo\rpaforge\packages\libraries
twine upload --repository-url https://test.pypi.org/legacy/ dist/*
```

**Или используйте один шаг с токеном:**

```powershell
# Для core
cd D:\Repo\rpaforge\packages\core
twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-..." dist/*

# Для libraries
cd D:\Repo\rpaforge\packages\libraries
twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-..." dist/*
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

##Troubleshooting

### "twine not recognized"
```powershell
# Проверьте, установлен ли twine
pip show twine

# Если нет, установите
pip install --user twine
```

### "Invalid API token"
- Убедитесь, что токен начинается с `pypi-`
- Проверьте, что токен имеет правильные права доступа (Limited scope)
- Сгенерируйте новый токен и попробуйте снова

### "403 Forbidden"
- Убедитесь, что используете `--token__` как имя пользователя
- Проверьте, что токен действителен и не истек

---

## Пример полной команды (одна строка)

```powershell
# Для core
twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-AgENdGVzdC5weXBpLm9yZwIk..." dist/rpaforge_core-0.3.0-py3-none-any.whl

# Для libraries  
twine upload --repository-url https://test.pypi.org/legacy/ -u "__token__" -p "pypi-AgENdGVzdC5weXBpLm9yZwIk..." dist/rpaforge_libraries-0.3.0-py3-none-any.whl
```
