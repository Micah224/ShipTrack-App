# Project A — Foundation & Licence Core

> The schema, the cryptography and the lean Worker that answers `activate`,
> `heartbeat` and `deactivate`. Ends when a hand-minted licence key can be
> activated over `curl` and returns a valid signed entitlement.

| | |
| --- | --- |
| **Status** | Design approved, awaiting spec review |
| **Date** | 2026-08-31 |
| **Parent plan** | `ship-track-pro-licensing-plan.md` (Rev C) |
| **Sub-project** | A of six (A → B → C → D → E → F) |
| **Runtime** | Cloudflare Workers (free) + Neon Lakebase Postgres (free) |

---

## 1. Scope

### In

- npm-workspaces restructure of `shiptrack-app` into two deployables and one shared package.
- Postgres schema and Drizzle migrations for `customers`, `customer_identities`,
  `licenses`, `activations`, `orders`, `admin_audit`.
- The `customers` to `neon_auth.user` link.
- Licence key generation, hashing, AES-GCM storage and reveal.
- Ed25519 entitlement signing, including key id rotation.
- The lean licence Worker: `/v1/health`, `/v1/activate`, `/v1/heartbeat`, `/v1/deactivate`.
- Site-identity tuple logic, seat leases, staging classification, auto-reclaim cron.
- Edge rate limiting.
- A CLI that mints a licence by hand — the working purchase route until Project F.

### Out

Each of these belongs to a later sub-project and is named here so the seam is explicit:

| Deferred | To |
| --- | --- |
| `releases` table, R2, download endpoint, update metadata in the heartbeat response | B |
| WordPress client, `Update URI`, `update_plugins_{host}`, sodium verification | C |
| Marketing pages, customer portal, magic link, Google OAuth client of your own | D |
| Admin console, Cloudflare Access, `admin_audit` **surface** (the table is built in A) | E |
| `webhook_events`, payment adapters, Paddle, licence delivery email | F |

### Non-goals

- No admin HTTP surface in A. Minting is a CLI run by the operator; there is no
  authenticated write route to build wrong.
- No customer-facing UI in A.
- No payment integration in A.

---

## 2. Decisions already taken

These were settled during brainstorming and are recorded so the plan does not relitigate them.

| Decision | Choice | Why |
| --- | --- | --- |
| Runtime split | Next.js app **and** a separate lean Worker | Keeps Ed25519 signing and the heartbeat off the OpenNext request pipeline and inside the free tier's 10 ms CPU budget |
| Database | Neon Lakebase Postgres, one database for both deployables | Single schema, single migration source, no cross-store sync |
| Auth | Neon Auth (managed Better Auth) | Password hashing runs on Neon's service, not in our CPU budget — which is what makes passwords viable on the free tier |
| Driver | `@neondatabase/serverless` | Hyperdrive requires Workers Paid. HTTP transport is a subrequest: wall-clock, not CPU |
| Hosting | `*.workers.dev` for now | Operator's call; the permanence risk is mitigated in section 7.3 |
| Object storage | Cloudflare R2 (in B) | Neon Object Storage is `us-east-2`-only public beta; this project is `aws-eu-west-2` |
| Payments | Adapter built, credentials deferred | Paddle not yet applied for; manual minting is the launch route |

### Evidence

Recorded because these were verified against the live project rather than assumed:

- `neon neon-auth status` reports `Auth Provider: better_auth`. Neon Auth *is* Better Auth, managed.
- The `neon_auth` schema contains `user`, `session`, `account`, `verification`, `jwks`,
  `organization`, `member`, `invitation`, `project_config`. `public` is empty.
- `neon_auth.project_config` shows Google OAuth enabled with `isShared: true`,
  email and password enabled, `magicLink.enabled: false`, organization plugin enabled,
  `webhook_config.enabled: false`.
- `neon_auth.user` carries `role` and `banned`; `neon_auth.session` carries
  `impersonatedBy`. Better Auth's admin plugin is active and available to Project E.
- Project region is `aws-eu-west-2`; Neon Functions and Object Storage are `us-east-2`-only.

---

## 3. Architecture

```
  WordPress sites ──────▶ ┌──────────────────────┐
  POST /v1/heartbeat      │  apps/licence-api    │
  POST /v1/activate       │  Cloudflare Worker   │──┐
  POST /v1/deactivate     │  Ed25519 · rate limit│  │
                          └──────────────────────┘  │   ┌────────────────────┐
                                     │              ├──▶│ Neon Postgres      │
                          ┌──────────────────────┐  │   │ public.*  (ours)   │
  Browsers ─────────────▶ │  apps/web            │──┘   │ neon_auth.* (Neon) │
  (portal, admin — D/E)   │  Next.js · OpenNext  │      └────────────────────┘
                          └──────────────────────┘               ▲
                                     │                           │
                                     └──▶ Neon Auth ─────────────┘
                                          (hosted Better Auth)

                          ┌──────────────────────┐
                          │  packages/core       │  schema · types · crypto
                          └──────────────────────┘  imported by both
```

Two deployables, one database, one shared package. The Worker never renders HTML;
the Next.js app never signs an entitlement. `packages/core` is the only place the
schema and the signing code are defined.

### 3.1 Repository layout

```
shiptrack-app/
├── apps/
│   ├── web/                  # Next.js + OpenNext  (D, E)
│   └── licence-api/          # lean Worker         (A, B, F)
│       ├── src/routes/       # activate · heartbeat · deactivate · health
│       ├── src/domain/       # seat leases · site identity · staging rules
│       └── wrangler.jsonc
├── packages/
│   └── core/
│       ├── src/schema/       # Drizzle table definitions
│       ├── src/crypto/       # Ed25519 · AES-GCM · key generation · hashing
│       ├── src/types/        # entitlement payload, typed refusals
│       └── drizzle/          # generated migrations
├── docs/superpowers/specs/
├── neon.ts
└── package.json              # workspaces: ["apps/*", "packages/*"]
```

The existing `src/` moves to `apps/web/src/`. `src/lib/auth.ts`, the `better-auth`
and `@better-auth/infra` dependencies and the `pg` Pool are deleted — Neon Auth
replaces all of them. `pg` remains only as a dev dependency for migrations and
scripts run on Node.

---

## 4. Data model

Postgres, in the `public` schema. Ported from the parent plan's SQLite DDL, with the
divergences called out beneath.

```sql
CREATE TABLE customers (
  id             TEXT PRIMARY KEY,                    -- ULID
  email          TEXT NOT NULL UNIQUE,                -- trim() + lower(), nothing more
  auth_user_id   UUID UNIQUE,                         -- neon_auth.user.id, NULL until they sign in
  name           TEXT,
  locale         TEXT,
  notes          TEXT,                                -- admin-only, never shown to the customer
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_identities (
  customer_id          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_customer_id)
);

CREATE TABLE orders (
  id                TEXT PRIMARY KEY,                 -- ULID
  provider          TEXT NOT NULL
                    CHECK (provider IN ('paddle','paypal','flutterwave','manual')),
  provider_order_id TEXT NOT NULL,
  provider_sub_id   TEXT,
  sku               TEXT NOT NULL CHECK (sku IN ('lifetime','annual')),
  amount_minor      INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  customer_id       TEXT REFERENCES customers(id),
  customer_email    TEXT NOT NULL,                    -- as the rail reported it
  status            TEXT NOT NULL
                    CHECK (status IN ('paid','refunded','chargeback','canceled')),
  reason            TEXT CHECK (reason IS NULL OR reason IN
                    ('comp','tester','migration','paid_offline','goodwill')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);

CREATE TABLE licenses (
  id             TEXT PRIMARY KEY,                    -- ULID
  key_hash       TEXT NOT NULL UNIQUE,                -- sha256(key), the O(1) lookup
  key_cipher     TEXT NOT NULL,                       -- AES-GCM(key) under a Worker secret
  key_prefix     TEXT NOT NULL,                       -- 'STP-4F2A', so support can find it
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  label          TEXT,                                -- customer-set, inline-editable in D
  sku            TEXT NOT NULL CHECK (sku IN ('lifetime','annual')),
  seats          INTEGER NOT NULL DEFAULT 1 CHECK (seats >= 1),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','expired','refunded','revoked')),
  updates_until  TIMESTAMPTZ,                         -- NULL = no update entitlement
  order_id       TEXT REFERENCES orders(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lic_customer ON licenses(customer_id);
CREATE INDEX idx_lic_prefix   ON licenses(key_prefix);

CREATE TABLE activations (
  id             TEXT PRIMARY KEY,                    -- ULID
  license_id     TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  install_id     TEXT NOT NULL,                       -- UUID minted once by the plugin
  site_key       TEXT NOT NULL,                       -- normalised host + path
  site_url       TEXT NOT NULL,                       -- as reported, for support screens
  environment    TEXT NOT NULL DEFAULT 'production'
                 CHECK (environment IN ('production','staging','development','local')),
  counts_seat    BOOLEAN NOT NULL DEFAULT true,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_day  DATE NOT NULL,                       -- the write guard
  released_at    TIMESTAMPTZ,                         -- deactivated or auto-reclaimed
  release_reason TEXT CHECK (release_reason IS NULL OR release_reason IN
                 ('self_service','auto_reclaim','admin')),
  UNIQUE (license_id, install_id)
);
CREATE INDEX idx_act_live    ON activations(license_id, released_at, counts_seat);
CREATE INDEX idx_act_site    ON activations(license_id, site_key);
CREATE INDEX idx_act_reclaim ON activations(last_seen) WHERE released_at IS NULL;

CREATE TABLE admin_audit (
  id         TEXT PRIMARY KEY,                        -- ULID
  actor      TEXT NOT NULL,                           -- Access identity, or 'cli:<user>'
  action     TEXT NOT NULL,                           -- 'license.mint' | 'license.reveal' | ...
  subject    TEXT NOT NULL,                           -- licence or customer id
  detail     JSONB,                                   -- before / after
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_subject ON admin_audit(subject, created_at DESC);
```

### 4.1 Divergences from the parent plan, and why

| Change | Reason |
| --- | --- |
| `sessions` and `auth_tokens` dropped | Neon Auth owns sessions and verification tokens in `neon_auth`. Keeping our own would be two sources of truth for one fact. |
| `customers.username` and `password_hash` dropped | Same. `neon_auth.user` and `neon_auth.account` hold these. |
| `customers.auth_user_id` added | The link to Neon Auth. See section 5. |
| `products` table dropped; `licenses.product_id` removed | There is exactly one product. A single-row table with a foreign key to it is ceremony. Reintroduce it the day there is a second product — it is an additive migration. |
| Unix `INTEGER` becomes `TIMESTAMPTZ` | Postgres has a real date type and `now()`. Unix seconds are produced at signing time, where the wire format actually requires them. |
| `counts_seat INTEGER` becomes `BOOLEAN` | It was always a boolean; SQLite has no boolean type, Postgres does. |
| `CHECK (...)` retained rather than `ENUM` | Postgres enums need `ALTER TYPE` to extend and cannot drop a value. `text` plus `CHECK` is a plain migration. |
| `activations.release_reason` added | Distinguishes a self-service release from a 21-day auto-reclaim. The abuse queue in E cannot read the signal without it, and it is free to record now. |
| `orders.status` and `reason` given `CHECK`s | The plan states the allowed values in prose; the constraint makes them true. |
| `releases` and `webhook_events` not created | Projects B and F respectively. Creating tables nothing reads is how schemas rot. |

---

## 5. The customers to neon_auth.user link

`customers` is the primary entity. `neon_auth.user` is a sign-in credential attached to it.

**Why this way round.** A Paddle webhook hands you an email address, not a user. The
overwhelmingly common lifecycle is: buy, receive key, activate, never register. The
parent plan says so explicitly — "Rows with no username are normal". A schema in which
the customer *is* the auth user cannot represent that person at all.

**The rule.** On every authenticated request in Projects D and E:

1. Read the user id from the verified Neon Auth session.
2. `SELECT * FROM customers WHERE auth_user_id = $1`. If found, done.
3. Otherwise normalise the session email (`trim`, `toLowerCase`, nothing else) and
   `SELECT ... WHERE email = $2`. If found, set `auth_user_id` and return it. This is
   the buyer who has just registered, arriving at the licences they already own.
4. Otherwise insert a new `customers` row carrying both.

Step 3 is what stops "I bought this and my account is empty". It is idempotent and
self-healing: a missed link repairs itself on the next request, which is why this is
preferred over the `webhook_config` route.

**Conflict rule for step 3.** If the row matched by email already carries a *different*
`auth_user_id`, do not reassign it. Both `customers.email` and `customers.auth_user_id`
are unique, so a reassignment would either fail loudly or silently transfer someone's
licences to another sign-in. Instead: leave the existing link intact, treat the incoming
session as a customer with no licences, and write an `admin_audit` row with action
`customer.identity_conflict` naming both user ids. This is rare — it needs two Neon Auth
users sharing one email address — and a human resolving it in Project E's merge tool is
the correct outcome. Silently picking a winner is not.

**No foreign key across to `neon_auth`.** `auth_user_id` is a plain unique `UUID`. Neon
owns and migrates that schema; a cross-schema constraint into managed tables is a
liability for no integrity gain we cannot get from application code plus the unique index.

**Email normalisation is `trim` plus `lower` and nothing more.** No Gmail dot-stripping,
no `+tag` removal. Per the parent plan: people use those deliberately, and silently
merging two real customers is worse than the duplicate it prevents. Merge is an admin
action in Project E.

---

## 6. Licence keys

### 6.1 Format

32 bytes from `crypto.getRandomValues`, Crockford base32, grouped so a human can read it
aloud or retype it:

```
STP-4F2A-9K7M-2XQR-8VNB-3HTY-6JWD-5PGZ
```

`STP` is a fixed prefix. `key_prefix` stores `STP-4F2A` — the first group only — which is
what appears in list views and support screens.

### 6.2 Storage: hash and ciphertext

- `key_hash` is `sha256(key)`, unique. Every activation looks up by this. O(1), and a
  stolen database yields no usable key.
- `key_cipher` is AES-GCM(key) under a 256-bit `LICENCE_KEY_SECRET` held as a Worker
  secret, never in the database. Decrypted only on an authenticated reveal.
- `key_prefix` is plaintext, for search.

Hash alone is wrong here, and this is the one place licence keys differ from passwords: a
customer who loses a key has nothing to reset to, because reissuing breaks every site
already activated against the old one. Reveal has to work. Storing the ciphertext beside
the hash is what makes it work without making the database sufficient to steal from.

**Every reveal writes `admin_audit`** — actor, licence id, timestamp — whether the
revealer is the owner in the portal or the operator in the console.

### 6.3 Minting CLI

`packages/core` exposes `mintLicence()`; `apps/licence-api` ships a `bin/mint.ts` run on
Node against `DATABASE_URL_UNPOOLED`. One invocation writes four rows in one transaction,
exactly as the parent plan requires:

`customers` (or reuses the existing one, matched on normalised email), `licenses`,
`orders` with `provider = 'manual'` and a required `reason`, and `admin_audit` with
`actor = 'cli:<os user>'`.

The `orders` row is written even when the amount is zero. Without it, revenue
reconciliation diverges from the licence count, and in a year nobody remembers why thirty
people hold keys that were never paid for. `reason` is the entire point of that row.

Two guards, per the plan: refuse a pasted key whose hash already exists (checked against
the `key_hash` unique index before insert, so a collision cannot hand two customers the
same licence), and refuse the mint when `admin_audit` already holds 20 or more rows with
`action = 'license.mint'` in the trailing hour. The second guard is not about the
operator — it is about what an attacker does with this code path if they ever reach it.

---

## 7. Signed entitlements

### 7.1 Payload

```jsonc
{
  "v": 1,
  "kid": "stp-2026a",
  "lic":  "sha256:8f3a...",    // hash of the key, never the key
  "site": "sha256:4d2e...",    // hash of the normalised site_key
  "install": "a3f1c8de-...",   // the plugin's install UUID
  "sku": "annual",
  "status": "active",          // active | expired | refunded | revoked
  "seats": { "used": 1, "total": 1 },
  "updates_until": 1790000000,
  "features": ["multi_carrier", "branded_page", "webhooks"],
  "api_base": "https://shiptrack-api.chairmancorporation365.workers.dev",
  "iat": 1756600000,
  "nbf": 1756599900,
  "exp": 1757204800,           // 7 days
  "nonce": "b64:client-supplied"
}
```

`site`, `install`, `nonce` and `kid` are load-bearing and all four are commonly omitted.
Without `site` and `install` a valid token is copy-pasteable between sites, which is how
a signing scheme gets built and remains worthless. `nonce` stops replay of a captured
good response. `kid` makes rotation possible, and rotation is impossible to retrofit
under pressure — so the plugin ships two public keys from day one and we sign with the
first.

**`features` is deliberately undefined in Project A.** The values shown above are
illustrative. Nothing in the current plugin is feature-gated, and no SKU tier defines a
feature set yet — that decision belongs with pricing in Project D and with the staged
degradation logic in Project C. Project A treats `features` as an opaque
`string[]`, populates it from a single constant, and signs it. Carrying the field from
the first release costs nothing and means adding real gating later needs no change to the
payload version or the signing code. The plugin in C must ignore unknown feature strings
rather than fail on them.

### 7.2 Signing

Ed25519 via WebCrypto — `crypto.subtle.sign('Ed25519', ...)`, sub-millisecond, comfortably
inside the CPU budget. The keypair is generated **offline** by a script in
`packages/core`; the private key is installed with `wrangler secret put ED25519_PRIVATE_KEY`
and exists nowhere else. Public keys are hard-coded as constants in the plugin in Project
C, never fetched over the network, because fetching them defeats the entire model.

The response returns the **exact bytes that were signed**, base64-encoded, alongside the
signature. The plugin must verify those bytes, never a re-encode:
`json_encode(json_decode($x))` will not reproduce the Worker's byte sequence — key order,
float formatting and slash escaping all differ — and a scheme built that way fails
intermittently on some hosts and not others.

### 7.3 api_base — what makes the workers.dev choice reversible

The `Update URI:` header names the WordPress filter hook (`update_plugins_{$hostname}`)
and is fixed for the life of a shipped build. It does **not** have to be the URL the
plugin calls. The client stores an API base in options and prefers the signed `api_base`
from the most recent entitlement.

So the header stays `shiptrack-api.chairmancorporation365.workers.dev` permanently and
harmlessly, while a future move to a real domain becomes a signed instruction that
existing installs pick up on their next heartbeat, during a window in which both hosts
answer. Because the field is inside the signed payload, it cannot be used to redirect a
site to an attacker's server.

### 7.4 Negative entitlements are signed too

The parent plan's client rule is that **only a signed, explicitly negative response may
downgrade anything**. That obliges the server to sign the negatives. Two response classes,
and the distinction matters:

| Class | Example | Shape | Plugin behaviour |
| --- | --- | --- | --- |
| **Licence state** | expired, revoked, refunded, seat limit reached | Signed entitlement with `status` set | May downgrade, per the staged schedule in C |
| **Transport / validation** | 429, 500, malformed request, unknown key | Plain typed JSON error, unsigned | Keep last known good state, back off |

An unknown key returns an unsigned `invalid_key` rather than a signed negative, because
we cannot bind a signature to a licence that does not exist — and a typo must never
downgrade a working site.

---

## 8. API surface

All routes are `POST` with a JSON body except `/v1/health`. Rate limited per section 10.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Uptime monitoring. No auth, no database read. |
| `POST /v1/activate` | Bind a key to an install. Returns a signed entitlement or a typed refusal. |
| `POST /v1/heartbeat` | Refresh the entitlement. Extended in B to carry update metadata in the same response. |
| `POST /v1/deactivate` | Release a seat. Idempotent. |

### 8.1 Request

```jsonc
{
  "key": "STP-4F2A-...",
  "install_id": "a3f1c8de-...",    // UUID, minted once by the plugin
  "site_url": "https://acmestore.com/shop",
  "environment": "production",     // hint only — see section 9.2
  "nonce": "b64:...",
  "plugin_version": "5.0.0",
  "wp_version": "6.8",
  "php_version": "8.2"
}
```

### 8.2 Response

```jsonc
{ "payload": "b64:...", "sig": "b64:..." }    // signed, positive or negative
{ "error": { "code": "rate_limited", "message": "...", "retry_after": 60 } }
```

The heartbeat response is shaped so Project B can add a sibling `update` object without a
breaking change. Folding the update check into the heartbeat halves the request count and
means there is no standalone "am I licensed?" call sitting in the code inviting deletion.

### 8.3 Error codes

`invalid_request`, `invalid_key`, `rate_limited`, `server_error`.
Licence *states* are not errors — they are signed entitlements with a `status`.

---

## 9. Seats, sites and leases

### 9.1 Identity is a tuple, not a URL

`site_key` is `home_url()` normalised: lowercase host, scheme stripped, leading `www.`
stripped, trailing slash stripped, path retained. Read together with `install_id`:

| Observed | Almost always | Policy |
| --- | --- | --- |
| Same install, URL changed | Domain change or migration | Move the seat silently |
| New install, same URL | Reinstall or DB restore | Reclaim the seat |
| Same install, two live URLs | Staging clone of production | Count once if one is staging; flag if both look production |
| New install, new URL | A genuinely new site | Consume a seat |
| Many installs, many URLs, one key | Sharing | Flag for review — never auto-revoke |

Rows one and two are where the return on this work actually is: handling them gracefully
removes most licensing support tickets before they are written.

### 9.2 Staging is free, but counted

`environment` from the client is a **hint only**. It derives from
`wp_get_environment_type()`, a customer-controlled constant, so anyone can declare
themselves staging. The server classifies independently and the server wins:

- TLDs `.dev`, `.test`, `.local`, `.staging`, `.example`; hostname `localhost`; bare IPs.
- Subdomain prefixes `local.`, `dev.`, `test.`, `stage.`, `staging.`.
- Known host patterns: WP Engine, Kinsta, Pantheon, Cloudways, Flywheel, SiteGround,
  InstaWP, GoDaddy managed.

Non-production activations set `counts_seat = false` and are capped at
`max(3, seats * 3)`. Charging a solo developer four seats to ship one site blocks a
purchase and recovers no revenue, because nobody was ever going to buy four seats.

### 9.3 Leases, not activate/deactivate

| Parameter | Value |
| --- | --- |
| Entitlement TTL | 7 days |
| Heartbeat | daily, jittered |
| Seat auto-reclaim | 21 days silent |
| Self-service deactivations | 10 per year — counted, never blocked |
| Seat re-grant after release | immediate |

Auto-reclaim runs as a Cloudflare Cron Trigger (free) once a day:

```sql
UPDATE activations
   SET released_at = now(), release_reason = 'auto_reclaim'
 WHERE released_at IS NULL
   AND last_seen < now() - INTERVAL '21 days';
```

This is the highest-value item in the whole sub-project, and it is not an anti-piracy
measure at all. It eliminates "I moved my site and now it says no activations left",
which is the most common support request in premium WordPress and the one most likely to
end in a refund from someone who was never trying to cheat.

### 9.4 The write guard

A naive heartbeat writes `last_seen` on every call. Guard it so a site writes at most
once a day:

```sql
UPDATE activations
   SET last_seen = now(), last_seen_day = $2
 WHERE id = $1 AND last_seen_day <> $2;   -- zero rows on repeat calls
```

Under Postgres this is about write amplification and compute time rather than a hard
daily ceiling, but the guard is equally worth having — see section 13.

---

## 10. Rate limiting

Cloudflare's native Rate Limiting binding, keyed on `key_hash`. No storage writes, free,
and it keeps the limiter off the database entirely.

**Deliberate divergence from the parent plan.** The plan specifies 60 requests per hour.
The Cloudflare binding supports periods of 10 or 60 seconds only, so a per-hour window is
not expressible. We implement **20 requests per 60 seconds per key**, which is burst
protection rather than a quota. A correctly behaving plugin makes two requests a day, so
this is three orders of magnitude of headroom for an honest client while still stopping a
hammering loop. A true hourly quota would need a counter in Postgres — a write on every
request, which is precisely what section 9.4 exists to avoid. If the abuse data in
Project E ever shows this is insufficient, revisit it there with evidence.

Refusals return `429` with `Retry-After`. The plugin treats 429 as "keep cache" — it is a
transport error, never a downgrade.

---

## 11. Configuration and secrets

| Name | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Worker secret and `.env.local` | Pooled. Application traffic. |
| `DATABASE_URL_UNPOOLED` | Local only | Migrations, CLI, dumps. Never in the Worker. |
| `ED25519_PRIVATE_KEY` | Worker secret | Entitlement signing. Generated offline. |
| `LICENCE_KEY_SECRET` | Worker secret | AES-GCM key for `key_cipher`. |
| `SIGNING_KID` | `wrangler.jsonc` var | Currently `stp-2026a`. |

`.env.local` and `.neon` are already gitignored — verified. Secrets reach the Worker via
`wrangler secret put`, never a committed file. Env parsing uses `@neon/env`'s `parseEnv`
against `neon.ts`, so a missing variable fails at startup with a named error rather than
at the first query.

**The Worker failure mode is set to fail-closed.** Failing open bypasses the Worker
entirely, which in Project B would serve unauthenticated downloads. Fail-closed on our
side is correct precisely because the *client* fails open: an unreachable server means the
plugin keeps its last known good state.

---

## 12. Testing

Per `superpowers:test-driven-development` — test first, throughout.

**Unit, no database.** The bulk of the risk lives in pure functions: site-key
normalisation, staging classification, the five-row identity tuple, seat arithmetic,
key formatting, AES-GCM round-trip, Ed25519 sign and verify, payload canonicalisation.

**Integration, against Neon.** `vitest` with `@cloudflare/vitest-pool-workers`, run
against a dedicated `test` Neon branch, truncating between tests. Named cases, each one a
support ticket we are choosing not to receive:

- Migration: same install, changed URL — seat moves, no new seat.
- Reinstall: new install, same URL — seat reclaimed, no new seat.
- Staging: `staging.acme.com` — `counts_seat = false`, not counted against the total.
- Lying client: `environment: "staging"` on `acme.com` — server classifies production.
- Seat exhaustion — a *signed* negative, not an unsigned error.
- Unknown key — an *unsigned* `invalid_key`, so a typo cannot downgrade a live site.
- Replay: a captured entitlement presented with a different nonce — rejected.
- Cross-site: an entitlement from site A presented by site B — rejected.
- Write guard: two heartbeats the same day — exactly one row written.
- Auto-reclaim: activation last seen 22 days ago — released with reason `auto_reclaim`.

**Branch per feature.** `neon checkout dev-<feature>` alongside a git worktree, so schema
changes are isolated and `neon diff` shows exactly what a feature altered.

---

## 13. Risks

| Risk | Assessment | Response |
| --- | --- | --- |
| **Neon free tier compute-hours** | Roughly 191 compute-hours a month, about 6.4 h/day at 0.25 CU. Heartbeats are jittered across 24 h, so past a few hundred sites the compute never suspends. This is the Neon-shaped equivalent of the D1 write ceiling — the split architecture does not dodge it. | Write guard (9.4), no database read on `/v1/health`, and measure real compute-hours at 50 and 200 sites. Neon Launch is $5/mo if it bites; a pricing event, not a redesign. |
| **workers.dev blocked by firewalls and security plugins** | Some corporate networks and WordPress security plugins block `*.workers.dev` outright. | The client fails open (C), so a blocked site keeps working. Expect a small number of "won't activate" tickets a real domain would not produce. `api_base` (7.3) makes the eventual move cheap. |
| **Google shared OAuth app** | `isShared: true` means users see a consent screen that is not yours. | Acceptable in development. Blocked on operator-supplied Google Cloud credentials before Project D ships. |
| **Neon migrates `neon_auth`** | It is a managed schema and can change under us. | We never write to it and hold no foreign key into it. The blast radius is the read in section 5, one function. |
| **Ed25519 private key loss** | Every shipped plugin trusts a hard-coded public key; losing the private key without a successor deployed is unrecoverable. | Generate two keypairs now; ship both public keys in the first plugin release; sign with `stp-2026a`. Keep the offline backup of both private keys outside this repository. |

---

## 14. Verify before building

Two items that could change the plan, each with a cheap test, in the spirit of the parent
plan's section 16:

1. **Does `@neondatabase/serverless` HTTP transport work under `global_fetch_strictly_public`?**
   `wrangler.jsonc` currently sets that flag. Test with a trivial query from a deployed
   Worker in the first task of the plan, before any route depends on it.
2. **Is the Cloudflare Rate Limiting binding available on this account's free plan?**
   If not, fall back to a per-key counter with a coarse five-minute bucket, accepting one
   extra write per bucket rather than per request.

---

## 15. Definition of done

- `npm run test` passes at the workspace root, including every named case in section 12.
- `neon diff` against the parent branch shows exactly the tables in section 4 and nothing else.
- A key minted by the CLI activates over `curl` and returns an entitlement whose
  signature verifies against the public key, containing the correct `site`, `install`
  and `nonce`.
- A second activation of the same key from a different site returns a **signed**
  seat-limit refusal.
- An unknown key returns an **unsigned** `invalid_key`.
- Two heartbeats on the same day produce exactly one row write.
- The auto-reclaim cron releases a 22-day-stale activation and leaves a 20-day-old one alone.
- No secret is committed; `git status` is clean of `.env*` and `.neon`.
