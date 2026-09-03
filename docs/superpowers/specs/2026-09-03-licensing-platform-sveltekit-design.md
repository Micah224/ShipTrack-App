# Licensing Platform — SvelteKit on Vercel

> Phases 1–5 of the ShipTrack Pro Custom Licensing & GitHub Distribution master
> plan: the database, the cryptography, the licence API, release ingestion into
> R2, the WordPress update protocol, and the admin console. Ends when an
> operator can sign in, mint a key, watch it activate, and revoke it.

| | |
| --- | --- |
| **Status** | Implemented, awaiting review |
| **Date** | 2026-09-03 |
| **Parent plan** | *ShipTrack Pro: Custom Licensing Platform & Distribution Master Plan* (PDF) |
| **Supersedes** | `2026-08-31-licence-core-foundation-design.md` |
| **Runtime** | SvelteKit 5 on Vercel + Neon Postgres 18 + Cloudflare R2 |

---

## 1. What this supersedes, and what it keeps

The 2026-08-31 spec described the same product on a different stack: a Next.js
app plus a lean Cloudflare Worker in an npm-workspaces monorepo, with Neon Auth
for sessions. The master plan replaces that stack with SvelteKit 5 on Vercel and
Skeleton UI, and the master plan wins — it is the current instruction.

Three of the older spec's decisions were **not** stack decisions and are kept,
because the master plan's section 5 is weaker on each and the cost of changing
any of them later is "every licence already issued":

| Kept from the older spec | What the master plan said | Why the older one wins |
| --- | --- | --- |
| `key_hash` + `key_cipher` + `key_prefix` | `key TEXT NOT NULL UNIQUE` in plaintext | A database dump would otherwise be a working licence generator. Hashing alone is not enough either — a customer who loses a key has nothing to reset to, because reissuing breaks every site already activated. So the ciphertext sits beside the hash. |
| Entitlement bound to `install` as well as `domain` | Bound to `domain` only | Without an install id, one valid token covers every site on a domain and is copy-pasteable between them. |
| `kid` in the token header | No key id | Rotation cannot be retrofitted under pressure. It costs one header field now. |

Everything else follows the master plan: its six tables, its tier and status
enums, its endpoint paths, its R2 pipeline, its WordPress protocol.

Two smaller deviations, both recorded so they are not mistaken for drift:

- **`environment` + `counts_seat` instead of `is_dev`.** Section 11 whitelists
  four distinct kinds of non-production site. `counts_seat` is the decision;
  `environment` is the reason for it, which is what a support screen needs.
- **Skeleton v5, not v3.** v3 is not the current release. The admin portal is
  Phase 5, so the surface area committed here is the theme setup only.

## 2. Schema

Six tables in `public`, uuid primary keys, `TIMESTAMPTZ` throughout. The full
definition is `src/lib/server/db/schema.ts`; the migration is
`drizzle/0000_init_licensing.sql`.

The parts that carry an argument:

- **`licenses`** stores no plaintext key. Lookup is by `key_hash`; `key_prefix`
  (`STP-4F2A`) is the only plaintext fragment, and exists so support can find a
  row from what a customer reads out.
- **`activations`** is unique on `(license_id, install_id)`, not on
  `(license_id, domain)`. A site that changes domain keeps its seat instead of
  silently consuming a second one. Rows are released by stamping `released_at`
  and `release_reason`, never deleted — the support and abuse views both need to
  see that a site was here and left.
- **`download_tokens`** stores `token_hash`, not the token. The raw value exists
  in the URL handed to WordPress and nowhere else.

### 2.1 The existing database blocks this migration

The Neon project was migrated on 2026-09-02 against the superseded design and
still carries `customers`, `licenses`, `activations`, `orders`,
`customer_identities`, `admin_audit` and `rate_buckets`, plus three rows in
`drizzle.__drizzle_migrations`.

`drizzle-kit migrate` fails against it with `relation "activations" already
exists` — and surfaces that **only as exit code 1, with no message printed**,
which is worth knowing before someone spends an afternoon on it. Verified by
replaying the migration statement by statement on a throwaway branch.

`scripts/reset-legacy-schema.sql` drops the legacy tables, the enum types and
the old ledger. It is deliberately *not* a migration: dropping customer tables
is not something a migration should do unattended the first time it runs in an
unfamiliar environment. Every affected table held zero rows when this was
written, and the script says to re-check that before running.

**Verification.** Neon branch `claude-schema-verify`
(`br-hidden-dust-za6gk0ms`, forked from the default branch at HEAD): reset
applied, then `drizzle-kit migrate` exited 0 and produced all six tables with
the expected column and index counts. Production was not touched.

## 3. Cryptography

**Entitlement tokens.** `base64url(header).base64url(payload).base64url(sig)`,
Ed25519 via `node:crypto`. The header carries `alg`, `typ` and `kid`.

The response returns the **exact bytes that were signed** alongside the token.
The plugin must verify those bytes and never a re-encode:
`json_encode(json_decode($x))` will not reproduce this byte sequence — key
order, slash escaping and float formatting all differ — and a client built that
way fails on some hosts and not others. There is a test asserting the returned
payload is byte-identical to the token's middle segment, because this is the
contract most likely to be broken by a well-meaning refactor.

**Payload.** `sub` is `sha256:<hash>`, never the key itself: a leaked token must
not hand over the credential it was minted from, and the plugin already holds
the key it typed in. `domain` and `install` bind it to one site. `nonce` blocks
replay of a captured good response. `nbf` is `iat - 60`, because WordPress hosts
drift and rejecting a token the server minted one second ago is the least useful
failure available.

**Refusals are signed too.** A revoked licence gets a signed token saying
`status: "REVOKED"` with an empty `features` array. Returning an unsigned error
lets a site with a patched hosts file drop the response and keep its last good
token; a signed refusal gives the plugin something authentic to act on, and the
7-day expiry bounds how long any captured token stays useful.

**Licence keys.** 20 CSPRNG bytes in Crockford base32 — no `I`, `L`, `O` or `U`,
so a key read down the phone cannot turn a `1` into an `I`. `normalizeLicenseKey`
accepts whatever a customer retypes: spaces, lowercase, missing dashes.

**Key generation is offline.** `npm run keys:generate` runs on a trusted machine
and verifies the pair against itself before printing it. The private key goes
into Vercel; the public key is a constant in the plugin. It is never fetched
over the network, because a plugin that downloads the key it verifies against is
verifying nothing.

## 3.1 Enforcing the seat cap without transactions

This is the hardest correctness problem in the codebase and two obvious answers
are both wrong, so the reasoning is recorded rather than left in the diff.

**Read the count, then insert.** Two concurrent activations both read the last
free seat as available, and both take it.

**Put the count in a `WHERE` guard on the insert and call it atomic.** It is
not. Under `READ COMMITTED` the guard's subquery reads the snapshot taken when
the statement started, and two inserts of *different* rows never block each
other, so both guards still pass. This version was written, and the integration
test caught it by failing on roughly one run in three — which is exactly how a
seat-cap bug reaches production, since one green run looks like proof.

**Lock the licence row.** The natural answer, and unavailable: `neon-http` has
no multi-statement transaction to hold a lock across, and moving this one path
to a WebSocket pool would give the request path a connection pool to exhaust —
the thing the driver choice exists to avoid.

**What is implemented.** Every claim writes its row, then asks Postgres where it
ranks among the live seat-holders ordered by `seat_claimed_at`. Ranks beyond
`max_seats` release themselves with `release_reason = 'SUPERSEDED'`. The
ordering is total and every racer sees the same committed rows, so exactly the
first `max_seats` survive under any interleaving — no lock, no retry loop, and
no window in which the live count exceeds the cap. The count guard is kept on
the insert as a fast path, rejecting the common uncontended over-claim without
writing anything.

`seat_claimed_at` is deliberately not `created_at`: a released install that
re-activates is taking a *new* seat and must queue behind whoever took one
meanwhile. Ordering by `created_at` would let a long-dormant install evict a
live one. It is only advanced when the install was not already holding a seat,
so an ordinary re-activation keeps its place.

Verified by `seats.integration.test.ts` against a real Postgres branch: twelve
concurrent claims against a one-seat licence yield exactly one winner, and
against a three-seat licence exactly three, across repeated runs.

## 4. Seats and site classification

`classifySite` reduces a URL to a host and sorts it into `PRODUCTION`,
`STAGING`, `DEVELOPMENT` or `LOCAL`. Only `PRODUCTION` consumes a seat.

Local TLDs (`.local`, `.test`, `.example`, `.invalid`, `localhost`), private IP
ranges, staging subdomain prefixes and the managed-host suffixes
(`*.wpengine.com`, `*.kinsta.cloud`, `*.pantheonsite.io`) are all free.

This generosity is deliberate. A developer who cannot run a staging copy without
burning the seat their live site needs will patch the plugin rather than buy a
second licence, and we would have taught them to.

Two near-misses are covered by tests: `staging-example.com` is production (the
prefix test is `staging.`, with the dot), and `172.32.0.1` is production
(the private range stops at `172.31`).

## 5. Grace period

A licence past `expires_at` enters `GRACE` for `grace_period_days` before it
reads `EXPIRED`. That is what protects a paying customer whose card expired on a
Friday from losing shipment creation over the weekend. `GRACE` still grants the
full feature set; the difference is visible to the plugin, which can nag.

## 6. Release ingestion

`release.published` → verify HMAC-SHA256 → pull the `shiptrack-pro-*.zip` asset
with Octokit → sha256 it → `PutObject` to R2 → upsert a `releases` row.

The signature comparison checks lengths before `timingSafeEqual`, which throws
on a mismatch rather than returning false; without the length check a forged
header of the wrong length produces a 500 instead of a 401, which tells an
attacker more than the failure itself does.

Any action other than `published` returns 200 with `skipped: true`. A 4xx would
make GitHub mark the hook as failing for events we simply do not care about.

Re-publishing a tag updates the row rather than failing. A corrected release is
a normal thing and must not require a manual database edit.

## 7. Update delivery

`updates/check` compares versions numerically, not lexically — `5.10.0` beats
`5.9.0`, which a string compare gets wrong, on exactly the release nobody is
watching for it. Prereleases sort below their release.

When no update exists it returns `update_available: false`, never a 404:
WordPress treats a failed update check as a broken plugin and nags the site
owner about it.

`updates/download/[token]` consumes the token **before** issuing the redirect,
not after. WordPress follows the 302 itself, so there is no second request to
consume it on, and a token that stayed live until the download finished would be
replayable for as long as the transfer took.

The 302 to a presigned R2 URL is what keeps the archive off the function
entirely: Cloudflare serves the bytes, at no egress cost and no CPU here.

## 8. Configuration

`src/lib/server/env.ts` reads `process.env` rather than `$env/dynamic/private`.
On Vercel's Node runtime they are the same object, and going direct is what lets
the mint and keygen CLIs import the very modules the server uses. The first
draft of `mint-license.ts` reimplemented the AES-GCM envelope because it could
not import the SvelteKit-flavoured module — two implementations of one envelope
drift, and the drift shows up as licences the server cannot decrypt.

The protection `$env/dynamic/private` offers is not lost: everything under
`$lib/server/` is server-only by path, so importing it into client code is
already a build error.

## 8.1 Second round: what the code review changed

A review after the first implementation found fifteen issues, all fixed on this
branch. The ones that changed a decision rather than a line:

- **The `features` column default disabled every tier.** It defaulted to
  `['truck','plane']`, and `effectiveFeatures` prefers a non-empty column over
  the tier matrix — so every minted licence, at any tier, granted exactly two
  features. The default is now `[]`, meaning "derive from the tier". The tests
  missed it because they only ever passed `features: []`, which no minted row
  held; there is now a test for the value the database actually writes.
- **Three seat-cap bypasses**, all the same mistake: deciding whether a seat is
  needed somewhere other than where it is taken. Re-activating a released
  install un-released it without a check; an install flipping from staging to
  production started counting without one; and heartbeat rewrote `counts_seat`
  from the caller's own `site_url`, so any install could relabel itself as
  staging, leave the seat ledger, and keep a valid entitlement. Seat logic now
  lives in one module, and heartbeat no longer touches `domain`, `environment`
  or `counts_seat` at all — a site that moves re-activates, which re-checks the
  cap.
- **Stored XSS in the changelog.** `marked` does not escape raw HTML, and the
  result is rendered in wp-admin on every licensed site. Output is now run
  through an allowlist sanitiser before storage — before, not on the way out,
  because a sanitiser that must be remembered at each read is one that
  eventually is not.
- **Unvalidated bodies.** A numeric `key` reached `String.prototype.trim` and
  turned an unauthenticated request into a 500. Bodies are now typed-checked
  into a 400.
- **Two features that were declared but did not exist.** `SEAT_RECLAIM_DAYS`
  was advertised in `.env.example` with no job reading it, and nothing ever
  deleted `download_tokens`, so the table grew for the life of the product.
  Both now run from a secret-protected daily cron.
- **`limits` ignored per-licence overrides**, so a bespoke licence got its
  custom features and its tier's caps — sold multi-branch, capped at one, with
  nothing surfacing it.
- **The reset script did not do what its own comment claimed**, dropping only
  the legacy tables and not the ones the migration creates, so the retry it
  promised died on `relation "audit_logs" already exists`.

## 8.2 Phase 5: the admin console

Five screens under `/admin`, on a Skeleton v5 shell.

**The theme is generated, not hand-picked.** `src/shiptrack-theme.css` builds
each colour ramp in OKLCH from the palette the plan names — Deep Navy `#0B3B5C`,
Amber `#F59E0B`, Cream `#F7F4EC` — so lightness steps evenly, chroma tapers at
both ends, and the 500 shade round-trips to the exact brand hex. Skeleton's
non-colour custom properties are left as the library ships them, which keeps
this a theme rather than a fork.

**Auth is a scrypt password plus an HS256 session cookie.** Symmetric signing
here, unlike the Ed25519 used for entitlements, and deliberately: an entitlement
is verified by software we do not control, which is what makes asymmetric
signing worth its cost; a session cookie is only ever verified by the process
that issued it.

The guard in `hooks.server.ts` is a path prefix rather than per-route checks, so
a new admin page is protected by existing rather than by someone remembering.

**Login rate limiting reads the audit log** instead of a counter table. The
failures have to be recorded anyway, and "how many times has this address failed
lately" is a question the audit log already answers. Ten failures in fifteen
minutes blocks further attempts from that address — including ones with the
correct password, which is the point.

**Every mutation is audited**, and every key reveal especially: a key that can
be read without a trace is one nobody can account for afterwards.

### 8.2.1 The `$` that ate the password hash

The scrypt envelope originally used `$` separators, as PHC-style hashes
conventionally do. Vite runs `.env` values through `dotenv-expand`, which treats
`$32768` and `$8` inside a value as variable references and substitutes them
with nothing — so the hash arrived at the server silently truncated, every login
failed with "credentials not recognised", and the same hash verified perfectly
from a Node CLI.

The envelope now uses `.`, matching the AES-GCM envelope, and a test asserts the
hash contains no `$` at all. Worth knowing before choosing a delimiter for any
other secret this project stores.

### 8.2.2 Configuration reaches the server through Vite

`env.ts` reads `process.env`, and Vite does not populate `process.env` from
`.env` — it exposes those values through `import.meta.env` instead. Without
help, `npm run dev` starts cleanly and then reports every secret as missing.
`vite.config.ts` now copies `.env` into `process.env` at config time, filling
only keys that are not already set so a real environment always wins. The CLIs
get the same behaviour through `node --env-file-if-exists=.env`.

### 8.2.3 What the dashboard does not show

The plan's dashboard calls for ARR and MRR. No table records what a licence was
sold for — the master plan's schema has no `orders` table and no price on the
licence — so any revenue figure here would be invented. The dashboard shows what
the data supports (active licences, seat utilisation, version adoption, tier
mix, stale installs) and says plainly why revenue is absent. Adding a price to
the licence, or restoring an orders table, is what would make that number real.

## 9. Not in this change

Phase 6 — the PHP client: `LicenseService`, `UpdateManager`, REST gating and the
Svelte licence card. The plugin repository is untouched by this branch.

Also outstanding, and named so they are not forgotten:

- **Rate limiting.** The older spec had it; there is no edge limiter here yet.
  `/api/v1/activate` is the endpoint that wants one first.
- **Icon and banner assets.** `updates/info` points at `/assets/icon-*.png`,
  which are not in `static/` yet. WordPress renders a placeholder until they are.

## 10. Verification performed

- `npm run lint` — clean.
- `npm run typecheck` — 0 errors across 1292 files.
- `npm test` — 107 unit tests passing; the 9 Postgres integration tests skip
  without `SEAT_TEST_DATABASE_URL`, keeping CI offline.
- The console driven end to end against a live Neon branch: sign in, mint a
  PROFESSIONAL licence, activate it through `/api/v1/activate` (which returned
  the full professional feature set and `{branches: 5, auditRetentionDays: 90}`
  — the proof that the features-default fix works), reveal the key, unbind the
  seat, revoke, and confirm the licence API then refuses with `license_revoked`.
  Login rate limiting confirmed to return 429 after ten failures, including for
  the correct password.
- `seats.integration.test.ts` against a live Neon branch — 9 passing across
  repeated runs, including twelve-way concurrency on one- and three-seat
  licences.
- `npm run build` — Vercel adapter output produced.
- `drizzle-kit migrate` against Neon branch `claude-schema-verify` — exit 0,
  six tables created with the expected columns and indexes.

Not verified, because it needs credentials this branch does not carry: the R2
round trip, the GitHub webhook against a real delivery, and an end-to-end
WordPress update.
