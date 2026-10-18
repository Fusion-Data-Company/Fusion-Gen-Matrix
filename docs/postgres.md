# PostgreSQL / Neon backend

The live app defaults to `DATABASE_PROVIDER=postgres` and `MEDIA_STORAGE_PROVIDER=vercel-blob`, matching the GitHub, Vercel, Neon and Vercel Blob development stack. MongoDB and R2 remain explicit legacy compatibility options. Demo continues to use the local file repository; showcase has no private datastore or live sign-in. A database URL alone never switches the app into live mode.

The implementation and migration passed isolated local verification. On October 18, 2026, the reviewed initial schema was applied to a newly authorized, dedicated free-plan Neon project; a committed setup marker was read back in a separate request. No unrelated database was used. The Vercel app remains a restricted showcase until its scoped runtime connection and other live-service acceptance checks are complete.

## Dedicated target

Use a newly approved, dedicated **Fusion Gen Matrix** Neon project with PostgreSQL 18, a production branch and database named `fusion_gen_matrix`. Place it in the approved region near the Vercel function region. Do not attach an existing unrelated application database just because it is available in the connected account. The initial migration refuses a database containing application relations. Extension-owned system relations may remain.

The runtime uses `pg` with a pooled Neon URL and Vercel's `attachDatabasePool` lifecycle integration. The migration uses the corresponding direct URL. Neither URL belongs in source, chat, logs or browser variables. Store them using the approved secret-management flow. The direct URL is only needed in the operator's migration process, not in the Vercel runtime.

| Setting | Purpose |
| --- | --- |
| `DATABASE_PROVIDER=postgres` | Default repository and Auth.js adapter in live mode |
| `DATABASE_URL` | Server-only pooled URL for the approved dedicated Matrix database |
| `DATABASE_URL_UNPOOLED` | Server-only direct URL, supplied only to the migration process |
| `MEDIA_STORAGE_PROVIDER=vercel-blob` | Default private media store; requires the approved dedicated Blob connection |

TLS certificates are verified. `sslmode=require` in a Neon URL is accepted but removed before passing an explicit `rejectUnauthorized: true` SSL configuration to `pg`; weaker SSL modes and arbitrary connection overrides are rejected. The runtime pool has at most 10 connections per instance, an 8-second connection timeout and a 15-second idle timeout. The existing authentication, email, Higgsfield and scheduler requirements remain in force.

## Migration and activation

Review `migrations/postgres/0001_matrix.sql` and `scripts/migrate-postgres.ts` before any remote action. The command requires an explicit target host and the exact database name. It uses an advisory lock and one transaction, verifies that the initial database is empty, and records the migration checksum. A repeated invocation verifies the same installed migration; it does not reseed balances. A changed checksum stops execution for review.

After the dedicated target and secure configuration have been approved, run this with the direct URL already supplied through the approved process environment:

```sh
pnpm db:migrate:postgres --apply --host <approved-direct-neon-host> --database fusion_gen_matrix
```

The placeholder is deliberately not an existing account's host. The command does not load `.env` files, provision resources, create roles or credentials, modify grants, export data, or connect storage. It rejects pooled hosts for migration. In Postgres mode, `pnpm db:init` only verifies the schema marker; it does not automatically apply migrations.

Activation is a separate operation: connect the pooled URL to the intended Vercel environment, select the database/storage providers, complete all other live configuration and deploy the reviewed build. Keep showcase active until secure configuration and real acceptance checks are ready. Verify a real magic link, session expiry/revocation, owner-only private media, a private storage round trip and the protected reconciler before authorizing a bounded provider generation. Keep billing disabled until its separate acceptance is complete. These instructions do not authorize a remote resource, credential, funding purchase or deployment.

## Data and transaction contract

All twelve application collections have separate tables in `fusion_matrix`, with a text primary key and JSONB document. IDs, ownership fields, job statuses, input hashes, provider request IDs, output keys, deletion tombstones, lease tokens, event markers and ledger entries keep their current shapes. The historical `r2Key` field remains the relative private media key for both storage providers.

The repository supports the application's equality, nested path, `$exists`, `$in`, `$lt`, `$gt`, sort and bounded-limit queries. Names and operators are validated; values and field paths are parameterized. Numeric and boolean values retain their types. Rate-limit expiry dates are restored as `Date` objects when read.

Each write callback runs on **one checked-out client at SERIALIZABLE isolation**, with a transaction-wide commit/rollback. PostgreSQL serialization failures/deadlocks and the narrow absent-read/concurrent-primary-key-insert race retry up to ten total attempts with bounded jitter. Other errors are not replayed. An ambiguous transport failure at COMMIT is never retried. Transaction callbacks must contain only database work; external generation submissions, email and media transfers stay outside them.

Reads use a read-only repeatable-read snapshot. Provider input transfer starts after that snapshot closes. Unique indexes preserve provider request IDs, Stripe customer IDs and ledger `(reason, refId, bucket)` business keys. Profile balances also have database checks for nonnegative safe integers. Failed ledger/job/event writes roll back together. Existing ownership checks and per-plan concurrency rules remain in the application.

Auth.js retains the existing Resend magic-link provider and database-session strategy. The official `@auth/pg-adapter` stores users, accounts, sessions and verification tokens in its public tables. Text user IDs support exact legacy ID preservation; newly created users receive UUID strings. Small adapter overrides make partial updates atomic, read session/user together, refuse expired sessions and consume tokens atomically. Deleting an auth user cascades to auth sessions/accounts while preserving application audit records.

Postgres has no MongoDB TTL monitor. The existing authenticated reconciliation endpoint performs bounded expiry cleanup for sessions, verification tokens, rate limits and preview sessions. Authorization independently rejects expiry; cleanup does not determine access. Jobs, billing events and ledger/idempotency records never use this cleanup. Schedule the protected endpoint before unattended live use.

This initial migration targets an empty database. It does **not** copy any existing MongoDB or client data. If a populated Matrix source is later confirmed, pause writers and plan an explicitly approved export/import that preserves Auth.js IDs, all application IDs, balances, ledger totals, request keys and unfinished/ambiguous jobs. Verify counts and invariants before switching; never replay a provider request merely to migrate it. Once writes occur in the new backend, switching the provider back alone is not a data rollback.

## Local verification

```sh
pnpm test
pnpm test:postgres
pnpm typecheck
```

`test:postgres` creates and removes its own PostgreSQL 18 cluster under `.tool-cache`, with a mode-0700 Unix socket under `/tmp` and **no TCP listener**. Child environments exclude connection/provider secrets. It never accepts `DATABASE_URL`. The default binary directory is `/opt/homebrew/opt/postgresql@18/bin`; on another machine explicitly set `MATRIX_PG_BIN` to a local PostgreSQL binary directory. It never starts or stops an existing service.

Fixtures exercise real SQL transactions for concurrent credit debits/refunds, job idempotency, ownership, predicate concurrency limits, rollback, failed/ambiguous submissions, retention leases, tombstones, Stripe event replay, rate limits, string IDs, auth sessions/tokens, expiry and migration guards. All media/payment/email providers remain mocked. These checks establish local database behavior, not remote Neon connectivity or paid generation.

References: [Neon driver choice](https://neon.com/docs/connect/choose-connection), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [node-postgres transactions](https://node-postgres.com/features/transactions), [node-postgres SSL](https://node-postgres.com/features/ssl), [Auth.js PostgreSQL adapter](https://authjs.dev/getting-started/adapters/pg), [PostgreSQL isolation](https://www.postgresql.org/docs/18/transaction-iso.html).
