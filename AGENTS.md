# gongu

## Scope

An easy-to-use web app with fun, dynamic colors for people with current, past, or future USCIS cases: case-type statistics, predicted dates, information, and a Reddit-style community. Not a USCIS government-style website. Do not expand the feature scope without a user request.

Stack: Vite + React + TanStack in the browser; PocketBase used as a Go framework in one backend binary. Browser integration uses the PocketBase JS SDK; request routing and SQLite ownership live in `pocketbase-app`. PostgreSQL access uses `pgxpool` + `sqlc`, not an ORM; query contracts live in `uscis-data`. This replaces TanStack Start and the previous ORM requirement. UI preferences remain TanStack UI and shadcn UI (Base).

The existing PostgreSQL ETL database owns USCIS data and runs on the same server where this project will live. A database tool/API is requested; its management operations are not yet defined.

## Load-bearing gotchas

- PostgreSQL access is read-only through current/typed views, including materialized views—not raw ETL tables. Some existing query surfaces are plain views; do not assume all need refresh. Exact contracts and ETL source paths live in `uscis-data`.
- Same-server deployment does not merge the two data stores or their privileges. Load `pocketbase-app` for the app/auth/community boundary.
- Layout: root Go module (`main.go`, `internal/`) embeds `web/dist`, so build the web app before `go build`/`go vet` (`make build`, `make check`). Dev: `make dev-api` + `make dev-web`. Tests exist; no CI jobs yet. ETL source inspection is not verification of the deployed database schema or grants.
- `web/` keeps the official shadcn Vite template's ESLint + Prettier and TypeScript 6.0 (typescript-eslint does not support TS 7 yet).

## Standing rules

- Write clean code: clear names, small focused functions, no dead code or speculative abstractions.
- Never save docs or plans to the repo (no README additions, docs/, plan files, decision logs, or summaries) unless the user explicitly asks.
- Write as few tests as possible. Tests must not slow development. No unit tests for implementation details.
- Before adding a test, answer: What observable behavior or contract does it protect? What credible regression fails it? Why doesn't existing coverage already catch that? Does it need a production seam (export, flag, wrapper) no real caller needs? Any missing answer means don't add it.
- Each contract gets one test, at the strongest boundary. Extend an existing case or table instead of adding a near-duplicate. Never add: assertion-free coverage probes, mocks that implement the behavior under test, expected values computed by the code under test, copied fixtures or export lists, source or string greps, private-helper tests, or test-only exports.
- A test that breaks under a behavior-preserving refactor asserts implementation; rewrite it at the real boundary or delete it.
- Bug fix: one regression test at the owning boundary, and it must fail on the pre-fix code.
- While developing, run only the focused test for the change. Run the full suite once before handoff.
- A required check lives in a git hook or a CI job. A line in AGENTS.md is not a check. Do not write "remember to lint."
- Add a pre-push hook only for format, lint, and typecheck on changed files, and only if that command finishes in under 10 seconds. Do not hook the full suite or a full-repo typecheck. If nothing is that fast, name the CI job in the skill and do not create a hook.
- A red check is fixed at the cause. Read the log and split waiting, setup, and running before changing tests, caches, or runners. Do not re-run it. Do not delete tests to make it faster until that split shows the time is in the tests.
- A skip, path filter, or continue-on-error that hides a real change and reports green fails the run.
- Independent checks run at the same time. The wait is the slowest job. Do not add work to that job if another job can run it.
- Do not switch runners, linters, or typecheckers in this setup. Measure this repo first.

## Skill map

- [uscis-data](.agents/skills/uscis-data/SKILL.md) — Load for USCIS PostgreSQL/API access, pgxpool/sqlc queries, current/typed views, materialized-view refreshes, case-type statistics, or predicted dates.
- [ui-sdk](.agents/skills/ui-sdk/SKILL.md) — Follow before using ui-sdk (`@ui-sdk/react`, `@ui-sdk/core` in `web/`), and read `web/node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `web/node_modules/@ui-sdk/react/docs/core.md` by heading and read `rendering.md` next to it.
- [pocketbase-app](.agents/skills/pocketbase-app/SKILL.md) — Load for PocketBase JS SDK, custom `/api/x/...` endpoints, Go app backend code, SQLite/dbx, auth, realtime, in-app data, community features, or requests crossing both data stores.

## Maintain

Prune instead of append; point instead of copy. Keep each rule in one place. Add a skill only when a domain has enough distinct knowledge to earn one.
