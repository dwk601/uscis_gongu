---
name: pocketbase-app
description: "Load for PocketBase JS SDK, pb.send, custom /api/x/ endpoints, Go app backend code, SQLite/dbx, authentication, realtime, in-app data, Reddit-style community features, or requests crossing PocketBase and PostgreSQL. For USCIS view/statistics-only work, use uscis-data instead."
---

# PocketBase app boundary

- The browser uses the PocketBase JS SDK for auth, realtime, and PocketBase collections. Call custom Go endpoints with `pb.send("/api/x/...", options)`; these handlers live in the same PocketBase backend binary, not a separate app server.
- PocketBase owns users, auth, file handling, in-app data, and the Reddit-style community. Its records and file metadata live in SQLite; file bytes use PocketBase's configured file storage. Use PocketBase APIs / `dbx` for this store, not the PostgreSQL query layer. Prefer record/file APIs when lifecycle hooks, validation, or file handling matter; direct `dbx` queries do not substitute for those behaviors.
- PostgreSQL is the existing USCIS ETL store, not a replacement PocketBase storage backend. Do not migrate ETL data into app collections or put app/community writes into ETL tables.
- Both services will live on the same server, but app identities and ETL source identities are separate. Scraped Reddit/forum records are research data, not this app's community content or authenticated members.
- Define community collections and actions only from confirmed requirements. “Reddit-style” is a direction, not authorization to add voting, chat, notifications, moderation workflows, or other unspecified features.
- Enforce ownership and access at PocketBase collection rules or Go request handlers, not only in React. Custom `/api/x/...` handlers must enforce their own applicable auth and authorization; `pb.send` and direct `dbx` access do not apply collection rules automatically. Derive the acting user from verified auth, not a client-supplied user ID. Public community content does not imply public access to auth records or private in-app data.
- Never use PocketBase superuser credentials in browser code or as a substitute for user authorization. Confirm public/private fields and permitted actions before opening collection access.
- A Go handler that combines app context with USCIS data must follow the `uscis-data` skill's read boundary. Keep the PostgreSQL connection server-side and distinct from PocketBase auth. Do not assume cross-store transactions or cascading deletes.
- PocketBase realtime is for PocketBase data; PostgreSQL view refreshes do not automatically emit collection realtime events.
- PocketBase moved off GitHub: import `ganigeorgiev.com/pocketbase/pocketbase` (see `go.mod`), not `github.com/pocketbase/...`. Collection schema changes are Go migrations via `migratecmd` (automigrate under `go run`). Community collections, rules, feeds, and rate limits are defined in `migrations/1740000000_community.go`. Rate limits key on client IP; configure PocketBase trustedProxy settings behind a proxy.

verify: `go test ./migrations -run '^TestCommunityRules$' -count=1`
