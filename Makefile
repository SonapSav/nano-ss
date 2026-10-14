# All tooling runs in Docker; see README.md. Nothing here needs Node on the host.

export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

COMPOSE := docker compose
RUN     := $(COMPOSE) run --rm dev

.PHONY: help certs dev install check lint typecheck test format build up down logs shell scenery

help: ## Show this list
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

certs: ## Create the local CA and HTTPS certificate in certs/
	mkdir -p certs
	$(COMPOSE) run --rm --build certs

dev: ## Run the dev server on https://<host>:5173
	mkdir -p certs
	$(COMPOSE) up --build dev

install: ## Install dependencies
	$(RUN) pnpm install

check: ## Lint, format check, type check, and test
	$(RUN) sh -c "pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test"

lint: ## Lint
	$(RUN) pnpm lint

typecheck: ## Type check
	$(RUN) pnpm typecheck

test: ## Run unit tests
	$(RUN) pnpm test

format: ## Format the code with Prettier
	$(RUN) pnpm format

scenery: ## Download and build game data (ephemerides, stars, textures) into public/
	$(RUN) node scripts/scenery/ephemeris.ts
	$(RUN) node scripts/scenery/stars.ts
	$(COMPOSE) run --rm gdal scripts/scenery/moon-sources.sh
	$(COMPOSE) run --rm gdal scripts/scenery/moon-sites.sh
	$(RUN) node scripts/scenery/textures.ts
	$(RUN) node scripts/scenery/sites.ts

build: ## Build the production image
	$(COMPOSE) build web

up: ## Start the production server on https://<host>:8787
	mkdir -p certs
	$(COMPOSE) up -d --build web

down: ## Stop all services
	$(COMPOSE) down

logs: ## Follow the production server logs
	$(COMPOSE) logs -f web

shell: ## Open a shell in the dev container
	$(RUN) bash
