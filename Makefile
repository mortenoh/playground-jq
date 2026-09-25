.DEFAULT_GOAL := help
UV ?= uv
HOST ?= 127.0.0.1
PORT ?= 8765
FRONTEND ?= frontend
STATIC := src/playground_jq/static
BUN := $(shell command -v bun 2>/dev/null)
FRONTEND_INSTALL = cd $(FRONTEND) && bun install --frozen-lockfile

.PHONY: help install lint static check test coverage gate dev serve verify verify-live record fill \
	ui ui-dev ui-fmt ui-lint ui-test ui-e2e ui-gate ui-static ui-install wheel clean

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Sync the virtualenv with all dev dependencies, and the frontend's
	$(UV) sync
	@if [ -n "$(BUN)" ]; then $(FRONTEND_INSTALL); else echo "bun not found: skipping the frontend install"; fi

lint: ## Format and auto-fix (mutating)
	$(UV) run ruff format .
	$(UV) run ruff check --fix .

static: ## Read-only gate without the tests: ruff, mypy, pyright
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run mypy src tests
	$(UV) run pyright

test: ## Run the offline test suite (includes verifying all content against snapshots)
	$(UV) run pytest

coverage: ## Run the tests under coverage and hold the gate
	$(UV) run coverage run -m pytest
	$(UV) run coverage report --fail-under=90

gate: static coverage ## What CI runs for the backend

check: static ui-gate test ## Everything read-only: static gates, the UI's, then the tests

dev: ## Run the API with reload on $(HOST):$(PORT) (pair with `make ui-dev`)
	$(UV) run pjq dev --host $(HOST) --port $(PORT)

serve: ui-static ## Build the UI into the package and serve everything on $(HOST):$(PORT)
	$(UV) run pjq serve --host $(HOST) --port $(PORT)

verify: ## Run every example, tutorial solution and guide snippet against its fixture
	$(UV) run pjq content check

verify-live: ## Run live-source examples against postman-echo and DHIS2 (profile play43)
	$(UV) run pjq content check --live

record: ## Refresh the recorded snapshots of every postman-echo and DHIS2 preset
	$(UV) run pjq sources record

fill: ## Record expected outputs for content that has none (review the diff!)
	$(UV) run pjq content fill

ui-install: ## Install the frontend's dependencies
	$(FRONTEND_INSTALL)

ui: ## Build the frontend bundle into frontend/dist
	$(FRONTEND_INSTALL) && bun run build

ui-dev: ## Run the vite dev server, proxying the API to $(HOST):$(PORT)
	cd $(FRONTEND) && bun run dev

ui-fmt: ## Format the frontend (mutating)
	cd $(FRONTEND) && bun run fmt

ui-lint: ## Frontend read-only gate: format check, oxlint, tsc
	cd $(FRONTEND) && bun run fmt:check && bun run lint && bunx tsc -b

ui-test: ## Frontend unit tests (vitest)
	cd $(FRONTEND) && bun run test

ui-e2e: ## Browser tests against a real server (needs `make ui` and chromium)
	cd $(FRONTEND) && bun run e2e

ui-gate: ## ui-lint and ui-test, skipped with a note when bun is missing
	@if [ -n "$(BUN)" ]; then $(MAKE) ui-lint ui-test; else echo "SKIPPING the UI gate: bun not found"; fi

ui-static: ui ## Build the frontend and copy it into the package for serving and the wheel
	find $(STATIC) -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
	cp -R $(FRONTEND)/dist/. $(STATIC)/

wheel: ui-static ## Build the wheel with the UI inside it
	$(UV) build --wheel
	unzip -l dist/*.whl | grep -q 'playground_jq/static/index.html'

clean: ## Remove build artifacts and tool caches
	rm -rf .ruff_cache .mypy_cache .pytest_cache htmlcov .coverage coverage.xml dist $(FRONTEND)/dist
	find . -name '__pycache__' -type d -prune -not -path './.venv/*' -exec rm -rf {} +
