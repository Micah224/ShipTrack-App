import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { optional, optionalNumber } from '../env.ts';

/*
 * Rate limiting for the licence API.
 *
 * THE RULE EVERY BUCKET OBEYS
 *   A bucket may be a security control only if its subject is `key_hash` or a
 *   server constant. Anything keyed on a value the caller invents is a courtesy
 *   that bounds blast radius, never a control. This project already shipped the
 *   other version: the admin login throttle keyed on the caller's own
 *   X-Forwarded-For, and changing one character of that header restored a full
 *   budget, so the cap bounded nothing. `getClientAddress()` reads the same
 *   header, so it is not an escape either. See `admin/session.ts`.
 *
 *   The licence key is the one caller-supplied value that is not freely
 *   choosable: its sha256 either matches a row in `licenses` or it does not. A
 *   second budget therefore costs a second licence, which costs money and is
 *   attributable.
 *
 * THE SAFETY INVARIANT THAT SETS THE WINDOWS
 *   No bucket may keep a legitimate site refused across two consecutive
 *   heartbeats. The plugin schedules `twicedaily` (LicenseService), the server
 *   issues 7-day tokens and the plugin allows 7 grace days, so a site that
 *   fails every heartbeat for a week loses its entitlement. The longest window
 *   here is one hour against a twelve-hour cron, and there is deliberately no
 *   per-day bucket anywhere: that is the shape that could park a paying site in
 *   refusal long enough to reach the cliff.
 *
 * WHAT THIS DOES NOT FIX
 *   A limiter bounds a rate, not a total. `claimSeat` applies no cap to
 *   non-seat activations, and the maintenance sweep only reclaims seat-holding
 *   ones, so those rows are touched by nothing. Rate limiting turns "unbounded"
 *   into "bounded per hour, forever". The structural cap in `seats.ts` is the
 *   actual fix; this buys time until it runs.
 */

export interface Bucket {
	/** Stored in `rate_counters.bucket`. */
	readonly name: string;
	readonly windowSecs: number;
	/** Limits scale with the licence, because a 25-seat agency is not abusive for being large. */
	readonly limit: (maxSeats: number) => number;
	/** Overrides the computed limit, for incident response without a deploy. */
	readonly envVar: string;
}

const HOUR = 3600;
const TEN_MINUTES = 600;

export const BUCKETS = {
	activate: {
		name: 'lic:activate',
		windowSecs: HOUR,
		limit: (seats) => Math.max(30, seats * 6),
		envVar: 'RATE_LIMIT_ACTIVATE'
	},
	heartbeat: {
		name: 'lic:heartbeat',
		windowSecs: TEN_MINUTES,
		limit: (seats) => Math.max(60, seats * 12),
		envVar: 'RATE_LIMIT_HEARTBEAT'
	},
	updates: {
		name: 'lic:updates',
		windowSecs: TEN_MINUTES,
		limit: (seats) => Math.max(60, seats * 12),
		envVar: 'RATE_LIMIT_UPDATES'
	},
	/*
	 * Deliberately the loosest licence bucket. Refusing a deactivate refuses the
	 * customer's own remedy for "all seats are in use", so this one erring
	 * towards permissive costs us a few audit rows and erring towards strict
	 * costs a customer their afternoon.
	 */
	deactivate: {
		name: 'lic:deactivate',
		windowSecs: HOUR,
		limit: (seats) => Math.max(60, seats * 12),
		envVar: 'RATE_LIMIT_DEACTIVATE'
	},
	/*
	 * Blast radius only. Without it, one misconfigured install on a 25-seat
	 * agency licence spends the shared licence budget and the other 24 healthy
	 * sites start seeing errors for someone else's mistake.
	 */
	install: {
		name: 'inst:v1',
		windowSecs: TEN_MINUTES,
		limit: () => 40,
		envVar: 'RATE_LIMIT_INSTALL'
	},
	/*
	 * The only global bucket, and safe precisely because of where it sits: it is
	 * incremented and consulted ONLY where the key failed to resolve. A caller
	 * presenting a valid licence never touches it, so an attacker who saturates
	 * it deliberately denies service to nobody. No two paying customers share a
	 * budget anywhere in this design, so the limiter cannot be used as a
	 * cross-customer denial lever.
	 *
	 * It has to be global: every guess is a different key_hash, so a per-key
	 * bucket would hand each guess a fresh budget.
	 */
	miss: {
		name: 'miss:v1',
		windowSecs: TEN_MINUTES,
		limit: () => 100,
		envVar: 'RATE_LIMIT_MISS'
	}
} as const satisfies Record<string, Bucket>;

export type BucketName = keyof typeof BUCKETS;

/** Server constant, so `miss:v1` has a subject that no caller can vary. */
const GLOBAL_SUBJECT = 'all';

export interface Consumed {
	bucket: string;
	hits: number;
	limit: number;
	retryAfter: number;
	exceeded: boolean;
	/** True for exactly one caller per window — the transition past the limit. */
	justCrossed: boolean;
}

export interface LimitOutcome {
	/** Whether the request should be refused. False in observe mode, always. */
	limited: boolean;
	/** The worst offender, for Retry-After and the audit row. */
	worst: Consumed | null;
	/** Every bucket consumed, for the RateLimit-* headers. */
	all: Consumed[];
	/** True when a limit was passed but the mode says only to watch it. */
	observedOnly: boolean;
}

/**
 * `observe` counts and reports without ever refusing; `enforce` refuses.
 *
 * The default is `observe` on purpose. Every limit in this file is a reasoned
 * inference from the plugin's cron cadence, not a measurement of the live fleet
 * — and the table these counters land in is exactly the instrument for taking
 * that measurement. Shipping enforcement against inferred numbers is the
 * version of this that generates support tickets.
 */
function mode(): 'observe' | 'enforce' {
	return optional('RATE_LIMIT_MODE', 'observe') === 'enforce' ? 'enforce' : 'observe';
}

export function limitFor(bucket: Bucket, maxSeats: number): number {
	return optionalNumber(bucket.envVar, bucket.limit(maxSeats));
}

/**
 * Which of a licence's 64 install slots this install falls in.
 *
 * Computed here rather than in SQL. `abs(hashtext(x)) % n` is the obvious
 * Postgres spelling and it can throw: `hashtext` returns a full-range int4, and
 * `abs((-2147483648)::int)` raises `integer out of range` — a rare, production-
 * only 500 in the middle of the limiter.
 *
 * Slotting at all is what stops a caller minting one counter row per invented
 * `install_id`: 64 rows per licence per window is the ceiling, whatever they do.
 */
export function slotFor(installId: string): number {
	return createHash('sha256').update(installId).digest()[0] % 64;
}

interface Pair {
	bucket: Bucket;
	subject: string;
	limit: number;
}

/**
 * Increments every bucket for one request, atomically, in one round trip.
 *
 * The ON CONFLICT DO UPDATE form is load-bearing and was measured rather than
 * assumed: `SET hits = rc.hits + 1` counted 200 of 200 concurrent increments
 * exactly, and handed every racer a distinct ordinal. The plausible-looking
 * alternative `SET hits = (SELECT hits FROM …) + 1` does not merely undercount —
 * under contention the subquery reads a snapshot in which the conflicting row is
 * not yet visible, returns NULL, and the statement dies on the not-null
 * constraint. It would 500 the endpoint, not loosen the limit. See
 * `limits.integration.test.ts`, which keeps that spelling as a negative control
 * so a green suite cannot come from a harness that failed to generate
 * contention.
 *
 * `now()` rather than `clock_timestamp()`, so both rows of a multi-row insert bin
 * against the same instant and cannot straddle a window boundary.
 */
async function consume(pairs: Pair[]): Promise<Consumed[]> {
	if (pairs.length === 0) return [];

	/*
	 * Two VALUES rows that collide on the primary key abort the whole statement
	 * with "ON CONFLICT DO UPDATE command cannot affect row a second time".
	 * Our buckets always differ by name so it cannot arise, but it is the one
	 * way to turn this statement into a 500 and it needs two identical pairs to
	 * reproduce — so assert rather than trust.
	 */
	const seen = new Set<string>();
	for (const p of pairs) {
		const id = `${p.bucket.name} ${p.subject}`;
		if (seen.has(id)) {
			throw new Error(`Duplicate rate-limit pair in one statement: ${p.bucket.name}`);
		}
		seen.add(id);
	}

	const values = sql.join(
		pairs.map((p) => sql`(${p.bucket.name}::text, ${p.subject}::text, ${p.bucket.windowSecs}::int)`),
		sql`, `
	);

	const result = await getDb().execute(sql`
		INSERT INTO rate_counters AS rc (bucket, subject, window_start, window_secs, hits)
		SELECT b.bucket,
		       b.subject,
		       date_bin(make_interval(secs => b.secs), now(), TIMESTAMPTZ 'epoch'),
		       b.secs,
		       1
		  FROM (VALUES ${values}) AS b(bucket, subject, secs)
		ON CONFLICT (bucket, subject, window_start)
		DO UPDATE SET hits = rc.hits + 1, last_hit_at = now()
		RETURNING rc.bucket AS bucket,
		          rc.hits AS hits,
		          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (rc.window_start
		            + make_interval(secs => rc.window_secs) - now()))))::int AS retry_after
	`);

	/*
	 * `db.execute` returns raw driver rows in snake_case. Casting them to a
	 * camelCase type compiles and lies — every field arrives undefined. This
	 * codebase has made that mistake once already; see `seats.ts`.
	 */
	const rows = ((result as unknown as { rows?: unknown[] }).rows ??
		(result as unknown as unknown[])) as Array<{
		bucket: string;
		hits: number;
		retry_after: number;
	}>;

	return rows.map((row) => {
		const pair = pairs.find((p) => p.bucket.name === row.bucket);
		const limit = pair?.limit ?? Number.MAX_SAFE_INTEGER;
		const hits = Number(row.hits);
		return {
			bucket: row.bucket,
			hits,
			limit,
			retryAfter: Number(row.retry_after),
			exceeded: hits > limit,
			/*
			 * Exactly one caller per window sees `limit + 1`, because RETURNING
			 * hands out unique ordinals. That makes this an exact edge trigger:
			 * one audit row per window however many thousands are refused. With a
			 * lossy counter you would either miss it or write one row per refusal
			 * and flood the very table you were protecting.
			 */
			justCrossed: hits === limit + 1
		};
	});
}

function decide(consumed: Consumed[]): LimitOutcome {
	const over = consumed.filter((c) => c.exceeded);
	/* Quote the LARGEST reset, or the client retries straight into a second refusal. */
	const worst = over.sort((a, b) => b.retryAfter - a.retryAfter)[0] ?? null;
	const enforcing = mode() === 'enforce';
	return {
		limited: enforcing && over.length > 0,
		worst,
		all: consumed,
		observedOnly: !enforcing && over.length > 0
	};
}

const ALLOWED: LimitOutcome = { limited: false, worst: null, all: [], observedOnly: false };

/**
 * Meters a request against a resolved licence.
 *
 * Called AFTER the key resolves, never before: incrementing a per-key bucket for
 * an unresolved key would let an enumerator mint one counter row per guess,
 * making the limiter into the unbounded-row problem it exists to prevent.
 */
export async function meterLicense(
	bucketName: Exclude<BucketName, 'miss' | 'install'>,
	license: { id: string; keyHash: string; maxSeats: number },
	installId?: string | null
): Promise<LimitOutcome> {
	const bucket = BUCKETS[bucketName];
	const pairs: Pair[] = [
		{ bucket, subject: license.keyHash, limit: limitFor(bucket, license.maxSeats) }
	];

	if (installId) {
		pairs.push({
			bucket: BUCKETS.install,
			subject: `${license.keyHash}:${slotFor(installId)}`,
			limit: limitFor(BUCKETS.install, license.maxSeats)
		});
	}

	try {
		const outcome = decide(await consume(pairs));
		await auditCrossings(outcome, license.id);
		return outcome;
	} catch (error) {
		return failOpen(error);
	}
}

/**
 * One audit row per bucket per window, written on the transition.
 *
 * `justCrossed` is `hits === limit + 1`, and that is exact rather than
 * approximate because RETURNING hands every racer a distinct ordinal — so
 * exactly one caller per window sees it, however many thousands are refused
 * behind them. This is the concrete payoff of a counter that does not lose
 * increments: with a lossy one you would either miss the transition entirely or
 * fall back to writing a row per refusal, flooding the table you are protecting.
 *
 * Written in observe mode too. That mode exists to measure, and a limit quietly
 * being passed is the measurement.
 */
async function auditCrossings(outcome: LimitOutcome, licenseId: string): Promise<void> {
	const crossings = outcome.all.filter((c) => c.justCrossed);
	if (crossings.length === 0) return;

	await getDb()
		.insert(auditLogs)
		.values(
			crossings.map((c) => ({
				licenseId,
				action: 'license.rate_limited',
				actor: c.bucket,
				details: {
					bucket: c.bucket,
					limit: c.limit,
					hits: c.hits,
					retry_after: c.retryAfter,
					enforced: outcome.limited
				}
			}))
		);
}

/** Meters a request whose key did not resolve. The only global bucket. */
export async function meterMiss(): Promise<LimitOutcome> {
	try {
		return decide(
			await consume([
				{ bucket: BUCKETS.miss, subject: GLOBAL_SUBJECT, limit: limitFor(BUCKETS.miss, 0) }
			])
		);
	} catch (error) {
		return failOpen(error);
	}
}

/**
 * A broken limiter must not break licensing.
 *
 * Every customer site calls these endpoints on a cron. A limiter that failed
 * closed would take the entire fleet down at once the first time Neon hiccuped,
 * turning a monitoring problem into an outage. The counter is the least
 * important thing in the request.
 */
function failOpen(error: unknown): LimitOutcome {
	console.error('[ratelimit] counter unavailable, allowing request:', error);
	return ALLOWED;
}
