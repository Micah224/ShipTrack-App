# ShipTrack Pro — Licensing Platform

Licensing, entitlement and update distribution for the
[ShipTrack Pro](https://github.com/Micah224/ShipTrack-Pro) WordPress plugin.

## Authorship

**Micah224 is the sole author.** Author every commit as them:

```bash
git commit --author='Micah224 <53346724+Micah224@users.noreply.github.com>' -m '...'
```

Leave the committer as `Claude <noreply@anthropic.com>` — this environment's SSH
signing key is registered to that address, and any other committer email makes
GitHub mark the commit "Unverified". GitHub credits the *author* field, so
setting it is what makes the attribution real.

## Stack

SvelteKit 5 on Vercel (`ship-track-app`) · Neon Postgres 18 via Drizzle
(`neon-http`) · Cloudflare R2 (`shiptrack-app-store`) · Skeleton UI v5 +
Tailwind v4.

## Commands

```bash
npm run check       # lint + typecheck + test + build; run before every push
npm run dev
npm run db:generate # regenerate the migration after a schema change
npm run keys:generate
npm run admin:hash
SEAT_TEST_DATABASE_URL='postgres://...' npx vitest run seats.integration
```

The seat integration tests need a **disposable** Neon branch — they write and
truncate. Never point them at production.

## Things that have already bitten

- **`drizzle-kit migrate` reports failure only as exit code 1, with nothing
  printed.** Check the exit code; replay statement by statement to see the error.
- **The Neon production branch may still carry the superseded 2026-08-31
  schema**, which collides with `0000_init_licensing`. See
  `scripts/reset-legacy-schema.sql`.
- **No stored secret may contain `$`.** Vite runs `.env` through dotenv-expand,
  which eats `$`-prefixed segments and silently truncates the value.
- **Vite does not populate `process.env` from `.env`.** `vite.config.ts` copies
  it across; `env.ts` depends on that.
- **A `WHERE` guard on an INSERT is not atomic** under READ COMMITTED. Seat
  capping is done by ranking and self-release — see `domain/seats.ts`.

## Agents

`.claude/agents/` — `neon-migrations`, `svelte-ui`, `licensing-invariants`,
plus the general `code-reviewer`, `test-writer`, `runtime-debugger`.

Design decisions and their reasoning live in
`docs/superpowers/specs/2026-09-03-licensing-platform-sveltekit-design.md`.
