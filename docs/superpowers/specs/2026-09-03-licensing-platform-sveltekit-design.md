# Licensing Platform — SvelteKit on Vercel

> Phases 1–4 of the ShipTrack Pro Custom Licensing & GitHub Distribution master
> plan: the database, the cryptography, the licence API, release ingestion into
> R2, and the WordPress update protocol. Ends when a minted key activates over
> `curl`, returns a signed entitlement, and a published GitHub release reaches a
> WordPress site as a native update.

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

## 9. Not in this change

Phase 5 (Skeleton admin portal: dashboard, licence manager, seat inspector,
release repository, audit view) and Phase 6 (the PHP client — `LicenseService`,
`UpdateManager`, REST gating, the Svelte licence card). The plugin repository is
untouched by this branch.

Also outstanding, and named so they are not forgotten:

- **Seat auto-reclaim.** `SEAT_RECLAIM_DAYS` and the index supporting it exist;
  the cron that acts on them does not. Until it runs, a site that vanishes holds
  its seat until someone releases it by hand.
- **Rate limiting.** The older spec had it; there is no edge limiter here yet.
  `/api/v1/activate` is the endpoint that wants one first.
- **Icon and banner assets.** `updates/info` points at `/assets/icon-*.png`,
  which are not in `static/` yet. WordPress renders a placeholder until they are.

## 10. Verification performed

- `npm run lint` — clean.
- `npm run typecheck` — 0 errors across 1292 files.
- `npm test` — 66 tests, 6 files, all passing.
- `npm run build` — Vercel adapter output produced.
- `drizzle-kit migrate` against Neon branch `claude-schema-verify` — exit 0,
  six tables created with the expected columns and indexes.

Not verified, because it needs credentials this branch does not carry: the R2
round trip, the GitHub webhook against a real delivery, and an end-to-end
WordPress update.
