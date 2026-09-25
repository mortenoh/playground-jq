.DEFAULT_GOAL := help
UV ?= uv
HOST ?= 127.0.0.1
PORT ?= 8765
FRONTEND := frontend
STATIC := src/playground_jq/static

.PHONY: help install refresh dev lint check test e2e live

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-8s\033[0m %s\n", $$1, $$2}'

install: ## Install backend and frontend dependencies, build the UI into the package
	$(UV) sync
	cd $(FRONTEND) && bun install --frozen-lockfile && bun run build
	find $(STATIC) -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
	cp -R $(FRONTEND)/dist/. $(STATIC)/

refresh: ## Wipe every build artifact, cache and dependency, then rebuild everything
	rm -rf .venv .ruff_cache .mypy_cache .pytest_cache .coverage htmlcov dist build
	rm -rf $(FRONTEND)/node_modules $(FRONTEND)/dist $(FRONTEND)/test-results $(FRONTEND)/playwright-report
	find . -name '__pycache__' -type d -prune -not -path './.venv/*' -exec rm -rf {} +
	$(MAKE) install

dev: refresh ## Refresh everything (make refresh), then serve on $(HOST):$(PORT) with reload
	$(UV) run pjq dev --host $(HOST) --port $(PORT)

lint: ## Format and auto-fix backend and frontend (mutating)
	$(UV) run ruff format .
	$(UV) run ruff check --fix .
	cd $(FRONTEND) && bun run fmt

check: ## CI gate, read-only: formatting, lint, types, all tests, all content verified
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run mypy src tests
	$(UV) run pyright
	$(UV) run coverage run -m pytest
	$(UV) run coverage report --fail-under=90
	cd $(FRONTEND) && bun run fmt:check && bun run lint && bun run typecheck && bun run test

test: ## Backend and frontend unit tests (content verification included)
	$(UV) run pytest
	cd $(FRONTEND) && bun run test

e2e: install ## Every example, tutorial and snippet through the UI, backend and static builds (needs chromium)
	./scripts/build_pages.sh build/pages
	cd $(FRONTEND) && bun run e2e

live: ## Verify live-source examples against postman-echo and DHIS2 (profile play43)
	$(UV) run pjq content check --live
