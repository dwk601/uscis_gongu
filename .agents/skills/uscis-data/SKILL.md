---
name: uscis-data
description: "Load for USCIS PostgreSQL/API access, pgxpool, sqlc, generated query types, current views, typed views, materialized views, refresh after ETL, case-type statistics, or predicted dates. For PocketBase auth or community-only work, use pocketbase-app instead."
---

# USCIS data contract

## Source of truth and read boundary

ETL checkout: `/Users/dwk/Personal/etl/uscis`. Read `src/uscis_etl/schema.sql` for columns and semantics, `src/uscis_etl/db.py` for `DERIVED_VIEWS` / `refresh_derived`, and `src/uscis_etl/sources/datasets.py` for refresh ordering. Its `AGENTS.md` owns ETL operations; production runs on the server, and the Mac database is a stale copy.

- App reads are limited to current/typed query views. Enforce explicit view grants for a read-only app role; no raw-table fallback, arbitrary SQL endpoint, or privileged credentials in the browser. Confirm deployed schema-qualified names and grants before integration: the source SQL uses unqualified names.
- The database management tool/API's operator and allowed operations remain undefined. Keep privileged management separate from app reads.

## PostgreSQL query boundary

- Use `pgxpool` for server-side PostgreSQL connections and `sqlc` for typed Go code generated from parameterized SQL. This replaces the ORM requirement. PocketBase/SQLite access follows `pocketbase-app`, not this query layer.
- Own the pool at the backend lifecycle boundary, not per request; close it on shutdown and pass request cancellation/timeouts to queries.
- Query explicit view names and columns. Preserve nullable fields and actual row identities; do not assume every view has an `id` column. Check generated types against the view's actual NULL behavior before exposing API results.
- Keep query SQL and sqlc configuration as generation inputs; regenerate rather than hand-edit generated Go. Any schema input needed by sqlc describes the ETL contract for code generation, not app-owned migrations to execute on the server.
- Do not add schema synchronization, app-startup DDL, or generated write endpoints for ETL views. SQL generation is not access control; the database grants above remain the enforcement boundary.

## Existing query surfaces

| Surface | Meaning / pitfall |
| --- | --- |
| `forum_post_current`, `user_timeline_current` | Plain views selecting latest landed versions by source/external ID, `first_seen_at`, then content hash. “Current” does not mean recently updated or verified USCIS status. Timeline view removes VisaJourney raw comments. |
| `visajourney_timeline`, `visajourney_timeline_stats` | Plain typed views; one selected snapshot per VisaJourney profile across trackers, not one person per tracker. Stages: `k1`, `aos`, `ead`, `ap`, `lift`, `n400`. |
| `immihelp_timeline`, `immihelp_timeline_stats` | Plain typed views; start/end meanings vary by tracker. Stats category NULL is the all-categories rollup; `unspecified` is missing category. Do not sum rollups with category rows. |
| `dol_perm_case`, `dol_lca_case`, `h1b_employer` | Materialized views. PERM/LCA deduplicate case numbers; H-1B rows describe employer/location/fiscal-year aggregates, not individual case timelines. |
| `visa_bulletin_series` | Plain typed view with stable category/country codes. Keep `final_action` and `dates_for_filing` separate. `C` = current; `U` = unavailable; neither is a cutoff date. |
| `uscis_form_quarter` | Plain typed view; fiscal quarters, quarterly and FYTD measures are distinct. Suppressed cells are NULL; `processing_months` is the quarter's reported median. |
| `processing_time_published` | Plain filtered view, not a latest-version selector; excludes template rows but retains publication versions. Choose publication explicitly to avoid double counting. |
| `forum_timeline_candidate` | Plain heuristic candidate view, not validated structured case events. |

This is an integration index, not permission to expose every column. `dataset_file_latest` is an ETL helper, not a public API. Inspect the source definition for the selected surface rather than copying extraction/deduplication into the app.

## Refresh and unsafe operations

- ETL owns post-load refreshes, not web requests. Existing mapping: `dol_perm` → `dol_perm_case`; `dol_lca` → `dol_lca_case`; `uscis_h1b_hub` → `h1b_employer`. Plain views require no refresh.
- `datasets.runner` refreshes after processing files, including when some files failed, then raises for those failures. `etl_run` records `running|succeeded|failed` per source, not one atomic all-source snapshot. Plain views can reflect committed partial loads. Do not equate a refreshed view with a fully successful source run.
- `refresh_derived` uses ordinary blocking refresh and commits it. No separate last-successful-refresh timestamp is recorded. Do not fabricate freshness from run completion or add a duplicate app refresh scheduler. Before changing concurrency, inspect prerequisites: PERM/LCA have unique case-number indexes; H-1B currently has no unique index.
- Do not run ETL `init-db` from app startup: schema initialization can drop/recreate versioned materialized views. Schema changes belong to the ETL owner. Altering/dropping ETL objects, changing privileges, or manually refreshing production requires explicit authorization for target and scope.

## Statistics and predicted dates

- Preserve case-type grouping, source population, time window, and date meanings. Keep self-reported timelines distinct from official USCIS/DOS/DOL statistics. Missing/suppressed data is not zero; older unmapped DOL fields can legitimately be NULL.
- Both timeline stats views require at least 30 included reports for a group; percentiles require at least 30 completed reports. Percentiles describe completed reports only, not survival-adjusted predictions. Immihelp completion includes approved and denied outcomes.
- `pending` is three-valued: true = self-reported pending under the view's rules, false = usable completion, NULL = excluded/uncertain. Stale or abandoned reports remain; do not label them verified active USCIS cases or turn NULL into false.
- Present predicted dates as estimates, not USCIS commitments or observed events. These views provide descriptive statistics, not a defined personalized prediction algorithm. Confirm the method before implementing calculations or claiming accuracy.
- Preserve ETL privacy protections: source authors are not stored and receipt numbers in timeline/forum content are masked. Do not reconstruct identities or link source profile IDs to app accounts. Official file rows are not covered by that masking; view access alone does not make every field safe to publish.

## Verification

Verify the real data/API boundary: approved views only, writes denied, source semantics retained, and no false claim of complete/fresh data after partial ETL failure. Apply test-selection rules in `AGENTS.md`.

The pool lives in `internal/uscis` (`USCIS_DATABASE_URL`, sessions forced read-only). App login `gongu_reader` inherits SELECT on the approved views from group `uscis_app_reader`; the ETL `schema.sql` re-grants that group on every init because recreated materialized views lose privileges, so exposing a new surface means changing that grant list. Local testing reaches the server database through `make db-tunnel` (`.env.local`); production connects as host `postgres` on the uscis-etl Coolify network. sqlc is pinned as a Go tool (`go tool sqlc generate`) but has no config yet: sqlc cannot parse the ETL `schema.sql` (lateral/JSON view bodies), so the first query must supply a view-column schema input for generation.

verify: TBD — add when the first sqlc query and its API route exist.

Upstream view-contract check, only when changing ETL contracts: `cd /Users/dwk/Personal/etl/uscis && uv run pytest tests/test_derived_views.py`. Requires local PostgreSQL and creates `uscis_etl_test` with isolated schemas; inspect that repo's test setup first. This is not an app check or a production refresh command.

CI job: TBD — no check commands or CI configuration exist yet; name the actual job when checks are introduced.
