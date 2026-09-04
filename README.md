# ShipTrack Pro — Licensing & Distribution Platform

SvelteKit 5 on Vercel, backed by Neon Postgres 18 and Cloudflare R2. It issues
signed entitlements to [ShipTrack Pro](https://github.com/Micah224/ShipTrack-Pro)
installs, meters seats, ingests plugin releases from GitHub, and serves plugin
updates to WordPress through the native update pipeline.

## What runs where

| Piece | Where |
| --- | --- |
| API + UI | SvelteKit 5, Vercel project `ship-track-app`, Node 22 serverless |
| Database | Neon `ShipTrack Pro`, PostgreSQL 18, `aws-eu-west-2` |
| Release archives | Cloudflare R2 bucket `shiptrack-app-store` |
| Build source | GitHub Releases on the plugin repository, via `release.published` webhook |
| Signing | Ed25519, private key in Vercel env, public key compiled into the plugin |

## API

All endpoints take and return JSON. Failures carry a machine-readable `code`;
the plugin branches on that, never on the prose.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/activate` | Bind an install to a licence, issue a signed entitlement |
| POST | `/api/v1/heartbeat` | Refresh the entitlement, report telemetry, report the latest version |
| POST | `/api/v1/deactivate` | Release a seat |
| POST | `/api/v1/updates/check` | WordPress update transient payload |
| POST | `/api/v1/updates/info` | `plugins_api` version-details modal |
| GET | `/api/v1/updates/download/[token]` | Consume a single-use token, 302 to a presigned R2 URL |
| POST | `/api/webhooks/github` | Ingest a published release into R2 and the database |

## Local setup

```bash
npm install
cp .env.example .env
npm run keys:generate      # prints the Ed25519 pair and both secrets
# paste the output into .env, then add the Neon and R2 credentials
npm run db:migrate
npm run dev
```

Mint a licence to test against:

```bash
npm run license:mint -- --email you@example.com --name "You" --tier PROFESSIONAL
```

## Checks

```bash
npm run check     # lint + typecheck + test + build
```

The seat-accounting tests need a real Postgres and are skipped without one, so
CI stays offline. To run them, point them at a disposable Neon branch — never
production, they write and truncate:

```bash
SEAT_TEST_DATABASE_URL='postgres://...' npx vitest run seats.integration
```

## Admin console

`/admin` — dashboard, licence manager, seat inspector, release repository and
audit log, behind a scrypt password and an HS256 session cookie.

```bash
read -rs PW && printf '%s' "$PW" | npm run admin:hash   # -> ADMIN_PASSWORD_HASH
```

Set `ADMIN_EMAIL`, that hash, and a 32-character `ADMIN_JWT_SECRET`. Ten failed
logins from one address in fifteen minutes blocks further attempts, correct
password included.

Note that stored secrets must not contain `$`: Vite runs `.env` values through
dotenv-expand, which silently eats `$`-prefixed segments. Everything this
project generates already avoids it.

## Scheduled maintenance

`vercel.json` runs `/api/internal/cron/maintenance` daily. It purges spent
download tokens and reclaims seats from installs that stopped checking in after
`SEAT_RECLAIM_DAYS`. It refuses to run unless `CRON_SECRET` is set, so an
unconfigured deployment fails visibly rather than exposing an endpoint that
deletes rows.

## Notes for whoever runs the first production migration

The Neon database still carries the tables from the superseded 2026-08-31
design. `drizzle-kit migrate` will fail against it — and reports that failure
only as a non-zero exit code, with no message. Run
`scripts/reset-legacy-schema.sql` first, having checked the row counts it names
are still zero. Full reasoning is in
`docs/superpowers/specs/2026-09-03-licensing-platform-sveltekit-design.md`.
