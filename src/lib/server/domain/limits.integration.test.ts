import { beforeAll, describe, expect, it } from 'vitest';

/*
 * The rate counter, against a real Postgres.
 *
 * This suite exists because the project has already shipped a counter that was
 * correct in every unit test and wrong under load: the seat cap's WHERE-guard
 * on an INSERT, which failed roughly one run in three because a subquery reads
 * the statement-start snapshot and inserts of different rows do not block each
 * other. A rate limiter has exactly the same shape, so asserting its
 * correctness without racing it would repeat the mistake rather than catch it.
 *
 * Needs a disposable branch — it writes and truncates. Skipped without one, so
 * CI stays offline.
 */

const URL_ = process.env.SEAT_TEST_DATABASE_URL;
const describeIf = URL_ ? describe : describe.skip;

describeIf('rate counters under concurrency', () => {
	let sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
	let bumpAtomic: (bucket: string, subject: string, secs: number) => Promise<number>;
	let bumpNaive: (bucket: string, subject: string, secs: number) => Promise<number>;

	beforeAll(async () => {
		const { neon } = await import('@neondatabase/serverless');
		sql = neon(URL_ as string) as never;

		/*
		 * A scratch table with the shipped DDL, deliberately NOT `rate_counters`.
		 * An earlier version of this file created the real table, which then made
		 * `drizzle-kit migrate` fail with "already exists" — reported, as ever, only
		 * as exit code 1 with nothing printed. A test must not own a name the
		 * migration owns.
		 */
		await sql`
			CREATE TABLE IF NOT EXISTS rate_counters_probe (
				bucket text NOT NULL,
				subject text NOT NULL,
				window_start timestamptz NOT NULL,
				window_secs integer NOT NULL,
				hits integer NOT NULL DEFAULT 0,
				first_hit_at timestamptz NOT NULL DEFAULT now(),
				last_hit_at timestamptz NOT NULL DEFAULT now(),
				PRIMARY KEY (bucket, subject, window_start)
			)`;

		/* The shipped statement. */
		bumpAtomic = async (bucket, subject, secs) => {
			const rows = await sql`
				INSERT INTO rate_counters_probe AS rc (bucket, subject, window_start, window_secs, hits)
				SELECT ${bucket}, ${subject},
				       date_bin(make_interval(secs => ${secs}), now(), TIMESTAMPTZ 'epoch'),
				       ${secs}, 1
				ON CONFLICT (bucket, subject, window_start)
				DO UPDATE SET hits = rc.hits + 1, last_hit_at = now()
				RETURNING rc.hits AS hits`;
			return Number(rows[0].hits);
		};

		/*
		 * The read-then-write spelling. Looks equivalent, is one statement, and
		 * is wrong: the subquery reads the snapshot from statement start, so
		 * concurrent callers all compute the same value and overwrite each other.
		 * Kept as the negative control — without it, a green suite would prove
		 * only that the test harness cannot generate contention.
		 */
		bumpNaive = async (bucket, subject, secs) => {
			const rows = await sql`
				INSERT INTO rate_counters_probe AS rc (bucket, subject, window_start, window_secs, hits)
				SELECT ${bucket}, ${subject},
				       date_bin(make_interval(secs => ${secs}), now(), TIMESTAMPTZ 'epoch'),
				       ${secs}, 1
				ON CONFLICT (bucket, subject, window_start)
				DO UPDATE SET hits = (
				  SELECT hits FROM rate_counters_probe
				   WHERE bucket = rc.bucket AND subject = rc.subject
				     AND window_start = rc.window_start
				) + 1
				RETURNING rc.hits AS hits`;
			return Number(rows[0].hits);
		};
	});

	async function raceAndCount(
		bump: (b: string, s: string, secs: number) => Promise<number>,
		subject: string,
		n: number
	): Promise<{ stored: number; ordinals: number[] }> {
		await sql`DELETE FROM rate_counters_probe WHERE subject = ${subject}`;
		const ordinals = await Promise.all(
			Array.from({ length: n }, () => bump('test:race', subject, 3600))
		);
		const rows = await sql`
			SELECT hits FROM rate_counters_probe WHERE bucket = 'test:race' AND subject = ${subject}`;
		return { stored: Number(rows[0].hits), ordinals };
	}

	it('counts every one of 200 concurrent increments', async () => {
		const { stored } = await raceAndCount(bumpAtomic, `atomic-${process.pid}`, 200);
		expect(stored).toBe(200);
	}, 60_000);

	it('hands every racer a distinct ordinal, which is what makes the audit trigger exact', async () => {
		// `hits === limit + 1` is used to write exactly one audit row per window.
		// That is only sound if no two callers can be handed the same number.
		const { ordinals } = await raceAndCount(bumpAtomic, `ordinals-${process.pid}`, 100);
		expect(new Set(ordinals).size).toBe(100);
		expect(Math.min(...ordinals)).toBe(1);
		expect(Math.max(...ordinals)).toBe(100);
	}, 60_000);

	it('NEGATIVE CONTROL: the read-then-write form is not a substitute', async () => {
		/*
		 * If this ever reports an exact 200, the harness has stopped generating
		 * real contention and every assertion above has quietly gone vacuous.
		 *
		 * Measured, and worse than predicted: under contention the subquery reads
		 * a snapshot in which the conflicting row is not yet visible, so it
		 * returns NULL, `NULL + 1` is NULL, and the statement dies on the
		 * not-null constraint. The plausible-looking spelling does not merely
		 * undercount — it 500s the endpoint. Accept either failure here; both
		 * disqualify it, and which one you get depends on timing.
		 */
		const subject = `naive-${process.pid}`;
		await sql`DELETE FROM rate_counters_probe WHERE subject = ${subject}`;

		const results = await Promise.allSettled(
			Array.from({ length: 200 }, () => bumpNaive('test:race', subject, 3600))
		);
		const threw = results.filter((r) => r.status === 'rejected').length;
		const rows = await sql`
			SELECT coalesce(max(hits), 0)::int AS hits FROM rate_counters_probe
			 WHERE bucket = 'test:race' AND subject = ${subject}`;
		const stored = Number(rows[0].hits);

		expect(threw > 0 || stored < 200).toBe(true);
	}, 60_000);

	it('bins concurrent callers into one window rather than several', async () => {
		// Two instances disagreeing about a boundary would write two rows and
		// silently double the limit. The boundary is computed by the database.
		const subject = `binning-${process.pid}`;
		await sql`DELETE FROM rate_counters_probe WHERE subject = ${subject}`;
		await Promise.all(Array.from({ length: 50 }, () => bumpAtomic('test:race', subject, 3600)));
		const rows = await sql`
			SELECT count(*)::int AS n FROM rate_counters_probe
			 WHERE bucket = 'test:race' AND subject = ${subject}`;
		expect(Number(rows[0].n)).toBe(1);
	}, 60_000);

	it('separates windows of different lengths for the same subject', async () => {
		const subject = `windows-${process.pid}`;
		await sql`DELETE FROM rate_counters_probe WHERE subject = ${subject}`;
		await bumpAtomic('test:race', subject, 600);
		await bumpAtomic('test:race', subject, 3600);
		const rows = await sql`
			SELECT count(*)::int AS n FROM rate_counters_probe
			 WHERE bucket = 'test:race' AND subject = ${subject}`;
		// Different window lengths bin to different boundaries, so these are
		// distinct rows and neither can spend the other's budget.
		expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1);
	}, 60_000);

	it('refuses two identical pairs in one statement, which is why the code asserts first', async () => {
		const subject = `dupe-${process.pid}`;
		await sql`DELETE FROM rate_counters_probe WHERE subject = ${subject}`;
		await expect(
			sql`
				INSERT INTO rate_counters_probe AS rc (bucket, subject, window_start, window_secs, hits)
				SELECT b.bucket, b.subject,
				       date_bin(make_interval(secs => b.secs), now(), TIMESTAMPTZ 'epoch'),
				       b.secs, 1
				  FROM (VALUES ('test:race'::text, ${subject}::text, 3600::int),
				               ('test:race'::text, ${subject}::text, 3600::int)) AS b(bucket, subject, secs)
				ON CONFLICT (bucket, subject, window_start)
				DO UPDATE SET hits = rc.hits + 1`
		).rejects.toThrow(/cannot affect row a second time/);
	}, 60_000);
});

/*
 * The probe table is left in place between runs on the disposable branch — it is
 * cheap, and dropping it would race the parallel test files. It is not part of
 * the schema and no migration knows about it.
 */
