import { beforeAll, describe, expect, it } from 'vitest';

/*
 * Integration coverage for seat accounting, against a real Postgres.
 *
 * Skipped unless SEAT_TEST_DATABASE_URL points at a disposable branch, so CI
 * and `npm test` stay offline. The unit tests cannot cover what matters here:
 * the cap is enforced by a WHERE guard inside one SQL statement, and whether
 * that guard actually holds is a property of Postgres, not of TypeScript.
 *
 *   SEAT_TEST_DATABASE_URL=postgres://... npx vitest run seats.integration
 */
const DB_URL = process.env.SEAT_TEST_DATABASE_URL;

describe.skipIf(!DB_URL)('seat accounting against Postgres', () => {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let claimSeat: any, releaseSeat: any, countSeats: any, classifySite: any, db: any, schema: any, keys: any;

	const telemetry = (version = '5.0.0') => ({
		siteUrl: 'https://acme-logistics.com',
		ipAddress: null,
		pluginVersion: version,
		wpVersion: null,
		phpVersion: null,
		activeMapProvider: null,
		transportModesUsed: []
	});

	async function makeLicense(maxSeats: number, tier = 'STARTER') {
		const [customer] = await db
			.insert(schema.customers)
			.values({ email: `seat-${crypto.randomUUID()}@example.com`, name: 'Seat Test' })
			.returning();
		const key = keys.generateLicenseKey();
		const [license] = await db
			.insert(schema.licenses)
			.values({
				keyHash: keys.hashLicenseKey(key),
				keyCipher: keys.encryptLicenseKey(key),
				keyPrefix: keys.licenseKeyPrefix(key),
				customerId: customer.id,
				tier,
				maxSeats
			})
			.returning();
		return license;
	}

	beforeAll(async () => {
		process.env.DATABASE_URL = DB_URL;
		process.env.LICENSE_KEY_SECRET ??= Buffer.alloc(32, 3).toString('base64');
		const dbmod = await import('../db/index.ts');
		db = dbmod.getDb();
		schema = await import('../db/schema.ts');
		({ claimSeat, releaseSeat, countSeats } = await import('./seats.ts'));
		({ classifySite } = await import('./site.ts'));
		keys = await import('../crypto/keys.ts');
	});

	it('admits the first production install and refuses the second on one seat', async () => {
		const license = await makeLicense(1);
		const first = await claimSeat(license, 'install-a', classifySite('https://acme-logistics.com'), telemetry());
		expect(first.ok).toBe(true);
		expect(first.used).toBe(1);

		const second = await claimSeat(license, 'install-b', classifySite('https://beta-freight.com'), telemetry());
		expect(second.ok).toBe(false);
	});

	it('is idempotent for the same install rather than a unique violation', async () => {
		const license = await makeLicense(1);
		await claimSeat(license, 'install-a', classifySite('https://acme-logistics.com'), telemetry());
		const again = await claimSeat(license, 'install-a', classifySite('https://acme-logistics.com'), telemetry('5.1.0'));
		expect(again.ok).toBe(true);
		expect(again.used).toBe(1);
		expect(again.activation.pluginVersion).toBe('5.1.0');
	});

	it('never charges a seat for a staging site', async () => {
		const license = await makeLicense(1);
		await claimSeat(license, 'prod', classifySite('https://acme-logistics.com'), telemetry());
		const staging = await claimSeat(license, 'stg', classifySite('https://staging.acme-logistics.com'), telemetry());
		expect(staging.ok).toBe(true);
		expect(await countSeats(license.id)).toBe(1);
	});

	it('refuses to un-release an install once its seat has been taken', async () => {
		// The original bypass: deactivate, let another install take the seat,
		// then re-activate the first and get a second live seat for free.
		const license = await makeLicense(1);
		await claimSeat(license, 'install-a', classifySite('https://acme-logistics.com'), telemetry());
		await releaseSeat(license.id, 'install-a');
		expect(await countSeats(license.id)).toBe(0);

		const b = await claimSeat(license, 'install-b', classifySite('https://beta-freight.com'), telemetry());
		expect(b.ok).toBe(true);

		const revived = await claimSeat(license, 'install-a', classifySite('https://acme-logistics.com'), telemetry());
		expect(revived.ok).toBe(false);
		expect(await countSeats(license.id)).toBe(1);
	});

	it('refuses a staging install flipping to production when the licence is full', async () => {
		// The second bypass: activate as staging (free), then re-activate the
		// same install as production once the real seats are gone.
		const license = await makeLicense(1);
		await claimSeat(license, 'stg', classifySite('https://staging.acme-logistics.com'), telemetry());
		await claimSeat(license, 'prod', classifySite('https://acme-logistics.com'), telemetry());
		expect(await countSeats(license.id)).toBe(1);

		const flipped = await claimSeat(license, 'stg', classifySite('https://realsite-freight.com'), telemetry());
		expect(flipped.ok).toBe(false);
		expect(await countSeats(license.id)).toBe(1);
	});

	it('lets exactly one of twelve concurrent claims win a single seat', async () => {
		// Both a read-then-write and a count guard inside the insert statement
		// let several of these through: under READ COMMITTED each racer's
		// subquery reads a snapshot taken before the others commit, and inserts
		// of different rows never block each other. The rank-and-back-out step
		// is what makes this deterministic.
		const license = await makeLicense(1);
		const results = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				claimSeat(license, `race-${i}`, classifySite(`https://race${i}-freight.com`), telemetry())
			)
		);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(await countSeats(license.id)).toBe(1);
	});

	it('lets exactly three of twelve concurrent claims win three seats', async () => {
		// The single-seat case can pass by luck; a cap above one cannot.
		const license = await makeLicense(3, 'PROFESSIONAL');
		const results = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				claimSeat(license, `multi-${i}`, classifySite(`https://multi${i}-freight.com`), telemetry())
			)
		);
		expect(results.filter((r) => r.ok)).toHaveLength(3);
		expect(await countSeats(license.id)).toBe(3);
	});

	it('never reports a winner whose row was backed out', async () => {
		// The invariant that matters to the caller: ok === still holding a seat.
		const license = await makeLicense(2, 'PROFESSIONAL');
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				claimSeat(license, `inv-${i}`, classifySite(`https://inv${i}-freight.com`), telemetry())
			)
		);
		const winners = results.filter((r) => r.ok);
		expect(winners).toHaveLength(2);
		for (const winner of winners) {
			expect(winner.activation.releasedAt).toBeNull();
			expect(winner.activation.countsSeat).toBe(true);
		}
	});

	it('honours a multi-seat cap exactly', async () => {
		const license = await makeLicense(3, 'PROFESSIONAL');
		for (let i = 0; i < 3; i += 1) {
			const r = await claimSeat(license, `p-${i}`, classifySite(`https://pro${i}-freight.com`), telemetry());
			expect(r.ok).toBe(true);
		}
		expect(await countSeats(license.id)).toBe(3);
		const fourth = await claimSeat(license, 'p-3', classifySite('https://pro3-freight.com'), telemetry());
		expect(fourth.ok).toBe(false);
	});
});
