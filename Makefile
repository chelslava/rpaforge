.PHONY: help install dev test lint format clean docs build release

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## Install packages in editable mode
	pip install -e packages/core
	pip install -e packages/libraries

dev:  ## Install development dependencies
	pip install -r requirements-dev.txt
	pre-commit install
	cd packages/studio && npm install

test:  ## Run all tests
	pytest packages/ -v --tb=short

test-cov:  ## Run tests with coverage
	pytest packages/ --cov=src --cov-report=html --cov-report=term

lint:  ## Run linting
	ruff check packages/
	mypy packages/core/src packages/libraries/src

format:  ## Format code
	ruff format packages/
	isort packages/

clean:  ## Clean build artifacts
	rm -rf build/ dist/ *.egg-info .pytest_cache .ruff_cache .mypy_cache
	rm -rf packages/*/build packages/*/dist packages/*/*.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

docs:  ## Build documentation
	mkdocs build

docs-serve:  ## Serve documentation locally
	mkdocs serve

build:  ## Build packages
	python -m build packages/core
	python -m build packages/libraries

release:  ## Create release (requires VERSION=x.y.z)
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release VERSION=x.y.z"; \
		exit 1; \
	fi
	python tools/release.py $(VERSION)

# Studio UI commands
studio-install:  ## Install studio dependencies
	cd packages/studio && npm install

studio-dev:  ## Run studio in development mode
	cd packages/studio && npm run dev

studio-build:  ## Build studio for production
	cd packages/studio && npm run build

studio-test:  ## Run studio tests
	cd packages/studio && npm test
