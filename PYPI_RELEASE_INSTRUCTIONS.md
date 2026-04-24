# PyPI Release Instructions for v0.3.0
# Windows PowerShell Version

## Опубликовать на PyPI

1. **Создайте API токен на PyPI**:
   - Перейдите на https://test.pypi.org/account/api-tokens/
   - Нажмите "Add API token"
   - Выберите "Limited" scope
   - Скопируйте токен (начинается с `pypi-`)

2. **Опубликуйте пакеты**:

```powershell
# Установите токен как переменную окружения
$env:PYPI_API_TOKEN = "pypi-..."

# Загрузите core
cd /mnt/d/Repo/rpaforge/packages/core
twine upload --repository-url https://test.pypi.org/legacy/ dist/*

# Загрузите libraries
cd /mnt/d/Repo/rpaforge/packages/libraries
twine upload --repository-url https://test.pypi.org/legacy/ dist/*
```

3. **Для production PyPI** (после теста):
   - Используйте `https://upload.pypi.org/legacy/` вместо testpypi

---

## Проверить публикацию

```powershell
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple rpaforge-core
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple rpaforge-libraries
```

---

## Создать GitHub Release (уже сделано)

https://github.com/chelslava/rpaforge/releases/tag/v0.3.0
