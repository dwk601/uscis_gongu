SHELL := /bin/bash

# Local-only dev defaults; override in .env.local.
PB_SUPERUSER_EMAIL ?= admin@gongu.local
PB_SUPERUSER_PASSWORD ?= gongu-local-admin
USCIS_DATABASE_URL ?= postgresql:///uscis_etl
export PB_SUPERUSER_EMAIL PB_SUPERUSER_PASSWORD USCIS_DATABASE_URL

USCIS_SSH ?= root@100.92.189.13
USCIS_TUNNEL_PORT ?= 15433

.PHONY: setup web build dev-api dev-web check db-tunnel sqlc

sqlc:
	go tool sqlc generate

setup:
	npm --prefix web ci
	cd web && npx playwright install chromium

web:
	npm --prefix web run build

build: web
	go build -o server .

# Loads .env.local when present; the Vite dev server proxies /api and /_ to this port.
dev-api: web
	@set -e; if [ -f .env.local ]; then set -a; source .env.local; set +a; fi; \
	go run . superuser upsert "$${POCKETBASE_USERNAME:-$$PB_SUPERUSER_EMAIL}" "$${POCKETBASE_PASSWORD:-$$PB_SUPERUSER_PASSWORD}"; \
	go run . serve --http=127.0.0.1:8090

# Forwards 127.0.0.1:$(USCIS_TUNNEL_PORT) to the server's uscis-etl PostgreSQL over Tailscale SSH. Container IP is looked up per run because Coolify redeploys change it.
db-tunnel:
	@ip=$$(ssh $(USCIS_SSH) 'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" $$(docker ps -q --filter label=coolify.resourceName=uscis-etl --filter label=com.docker.compose.service=postgres)'); \
	echo "Tunnel 127.0.0.1:$(USCIS_TUNNEL_PORT) -> $$ip:5432 (Ctrl-C to stop)"; \
	ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:$(USCIS_TUNNEL_PORT):$$ip:5432 $(USCIS_SSH)

dev-web:
	npm --prefix web run dev

check: web
	@npm --prefix web run lint & lint=$$!; \
	go vet ./internal/... ./migrations/... ./web . && go test ./internal/... ./migrations/... ./web . & go=$$!; \
	(cd web && npx playwright test) & browser=$$!; \
	status=0; wait $$lint || status=1; wait $$go || status=1; wait $$browser || status=1; exit $$status
