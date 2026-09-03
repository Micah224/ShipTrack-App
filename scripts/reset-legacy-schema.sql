-- Reset the public schema before applying 0000_init_licensing.
--
-- WHY THIS EXISTS
--   The Neon project was migrated on 2026-09-02 against the earlier
--   Cloudflare-Worker design (ULID keys, orders, customer_identities,
--   rate_buckets). This branch supersedes that design, and its migration
--   creates `customers`, `licenses` and `activations` under a different shape,
--   so `drizzle-kit migrate` fails with:
--
--       relation "activations" already exists
--
--   drizzle-kit reports that failure only as a non-zero exit code, with no
--   message, which is why this is written down rather than left to be
--   rediscovered.
--
-- WHY IT IS NOT A MIGRATION
--   Dropping customer tables is not something a migration should do on its own
--   the first time someone runs it in an unfamiliar environment. Run this by
--   hand, having checked the counts below are zero.
--
-- BEFORE RUNNING, CONFIRM THERE IS NOTHING TO LOSE:
--
--   SELECT
--     (SELECT count(*) FROM customers) AS customers,
--     (SELECT count(*) FROM licenses)  AS licenses,
--     (SELECT count(*) FROM orders)    AS orders;
--
--   All three were zero when this branch was written. If they are not zero for
--   you, stop: the data needs migrating, not dropping, and that is a different
--   piece of work.
--
--   neon_auth.* is Neon's own schema and is deliberately left alone.

BEGIN;

-- Tables this branch's own migration creates. Dropped so the script does what
-- its comment claims: a migration that failed part-way through can be retried
-- after running this, rather than dying on `relation "audit_logs" already
-- exists` -- the same silent non-zero exit this file exists to prevent.
DROP TABLE IF EXISTS download_tokens CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS releases CASCADE;

-- Tables from the superseded 2026-08-31 design.
DROP TABLE IF EXISTS admin_audit CASCADE;
DROP TABLE IF EXISTS rate_buckets CASCADE;
DROP TABLE IF EXISTS customer_identities CASCADE;
DROP TABLE IF EXISTS activations CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- Enum types the new schema declares. Dropped so a re-run of the migration is
-- idempotent after a partial failure.
DROP TYPE IF EXISTS license_status CASCADE;
DROP TYPE IF EXISTS license_tier CASCADE;
DROP TYPE IF EXISTS activation_environment CASCADE;
DROP TYPE IF EXISTS activation_release_reason CASCADE;

-- The old ledger. Left in place, drizzle-kit would either replay against the
-- wrong baseline or skip the new migration outright depending on timestamps.
DROP TABLE IF EXISTS drizzle.__drizzle_migrations;

COMMIT;
