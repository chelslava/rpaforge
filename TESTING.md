# RPAForge Test Configuration

## Running Tests

Tests must be run **separately** due to import conflicts between packages:

```bash
# Core tests
python -m pytest packages/core/tests -q

# Libraries tests
python -m pytest packages/libraries/tests -q
```

## Coverage

```bash
# Core coverage
python -m pytest packages/core/tests --cov=packages/core/src --cov-report=term-missing

# Libraries coverage
python -m pytest packages/libraries/tests --cov=packages/libraries/src --cov-report=term-missing
```

## CI

In CI, tests are run in parallel jobs. See `.github/workflows/ci.yml`.
