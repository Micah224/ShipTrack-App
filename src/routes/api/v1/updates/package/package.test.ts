import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashDownloadToken } from '$lib/server/crypto/keys';
import type { License } from '$lib/server/db/schema';
import { findLicenseByKey } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss, type LimitOutcome } from '$lib/server/domain/limits';
import { downloadableRelease, type ReleaseSummary } from '$lib/server/domain/releases';
import { POST } from './+server';

/*
 * Only the lookups are stubbed. The token is issued by the real
 * `issueDownloadToken` against a recording `getDb`, so these tests hold the
 * rollback link to the same mechanism the update check uses: hash-only at rest,
 * bound to licence, release and host, with the configured TTL.
 */
const inserted = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('$lib/server/db', () => ({
	getDb: vi.fn(() => ({
		insert: () => ({
			values: async (row: Record<string, unknown>) => {
				inserted.push(row);
			}
		})
	}))
}));
vi.mock('$lib/server/domain/licenses', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domain/licenses')>()),
	findLicenseByKey: vi.fn(async () => license)
}));
vi.mock('$lib/server/domain/limits', () => ({
	meterLicense: vi.fn(async () => open),
	meterMiss: vi.fn(async () => open)
}));
vi.mock('$lib/server/domain/releases', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domain/releases')>()),
	downloadableRelease: vi.fn(async (version: string) => (version === stored.version ? stored : undefined))
}));

const open: LimitOutcome = {
	limited: false,
	worst: null,
	all: [{ bucket: 'lic:updates', hits: 3, limit: 60, retryAfter: 420, exceeded: false, justCrossed: false }],
	observedOnly: false
};

const license = {
	id: '0b0b0b0b-0000-4000-8000-000000000001',
	keyHash: 'abc123',
	tier: 'PROFESSIONAL',
	maxSeats: 3,
	status: 'ACTIVE',
	expiresAt: null,
	gracePeriodDays: 7,
	features: [],
	limits: null
} as unknown as License;

const stored: ReleaseSummary = {
	id: '1e1e1e1e-0000-4000-8000-000000000051',
	tag: 'v5.1.0',
	version: '5.1.0',
	minPhp: '8.1',
	minWp: '6.4',
	testedUpTo: '6.9',
	r2StorageKey: 'releases/shiptrack-pro-5.1.0.zip',
	fileSize: 1024,
	fileSha256: 'f'.repeat(64),
	downloadCount: 0,
	publishedAt: new Date('2026-09-01T09:00:00Z')
};

beforeEach(() => {
	vi.stubEnv('PUBLIC_APP_URL', 'https://licence.test/');
	vi.stubEnv('DOWNLOAD_TOKEN_TTL_MINUTES', '15');
	inserted.length = 0;
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function post(body: unknown) {
	const request = new Request('https://licence.test/api/v1/updates/package', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

const valid = { key: 'STP-TEST-TEST-TEST', site_url: 'https://www.Owlex.example.com/shop', version: '5.1.0' };

describe('POST /api/v1/updates/package', () => {
	it('issues a single-use download link for exactly that release', async () => {
		const before = Date.now();
		const response = await post(valid);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			ok: true,
			version: '5.1.0',
			package: expect.stringMatching(/^https:\/\/licence\.test\/api\/v1\/updates\/download\/tok_[\w-]+$/),
			requires: '6.4',
			requires_php: '8.1',
			tested: '6.9'
		});
		expect(downloadableRelease).toHaveBeenCalledWith('5.1.0');
		expect(meterLicense).toHaveBeenCalledWith('updates', license);
		expect(response.headers.get('ratelimit-remaining')).toBe('57');

		// The same token row the update check writes: hash only, bound, expiring.
		const token = body.package.split('/').pop();
		expect(inserted).toHaveLength(1);
		expect(inserted[0]).toMatchObject({
			tokenHash: hashDownloadToken(token),
			licenseId: license.id,
			releaseId: stored.id,
			domain: 'owlex.example.com'
		});
		expect(JSON.stringify(inserted[0])).not.toContain(token);
		const ttl = (inserted[0].expiresAt as Date).getTime() - before;
		expect(ttl).toBeGreaterThanOrEqual(15 * 60_000);
		expect(ttl).toBeLessThan(15 * 60_000 + 5_000);
	});

	it('answers 404 unknown_version, and issues nothing, for a version that is not downloadable', async () => {
		const response = await post({ ...valid, version: '4.0.0' });

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ ok: false, code: 'unknown_version' });
		expect(inserted).toHaveLength(0);
	});

	it('refuses an unknown key, metered on the miss bucket only, and issues nothing', async () => {
		vi.mocked(findLicenseByKey).mockResolvedValueOnce(undefined);

		const response = await post(valid);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ ok: false, code: 'unknown_key' });
		expect(meterMiss).toHaveBeenCalledOnce();
		expect(meterLicense).not.toHaveBeenCalled();
		expect(downloadableRelease).not.toHaveBeenCalled();
		expect(inserted).toHaveLength(0);
	});

	it('answers 429 when the licence is over its updates budget', async () => {
		vi.mocked(meterLicense).mockResolvedValueOnce({ ...open, limited: true, worst: open.all[0] });

		const response = await post(valid);

		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('420');
		expect(inserted).toHaveLength(0);
	});

	it.each([
		['REVOKED', { status: 'REVOKED' }, 'license_revoked'],
		['SUSPENDED', { status: 'SUSPENDED' }, 'license_suspended'],
		['past its grace period', { expiresAt: new Date('2026-01-01T00:00:00Z') }, 'license_expired']
	])('refuses a licence that is %s, before looking up the release', async (_label, overrides, code) => {
		vi.mocked(findLicenseByKey).mockResolvedValueOnce({ ...license, ...overrides } as License);

		const response = await post(valid);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ ok: false, code });
		expect(downloadableRelease).not.toHaveBeenCalled();
		expect(inserted).toHaveLength(0);
	});

	it.each([
		['no version', { key: valid.key, site_url: valid.site_url }],
		['a numeric version', { ...valid, version: 5.1 }],
		['a tag instead of a version', { ...valid, version: 'v5.1.0' }],
		['a partial version', { ...valid, version: '5.1' }],
		['a path', { ...valid, version: '../../5.1.0' }],
		['SQL', { ...valid, version: "5.1.0' OR '1'='1" }],
		['an over-long version', { ...valid, version: `5.1.0-${'a'.repeat(40)}` }],
		['no key', { site_url: valid.site_url, version: valid.version }],
		['a site_url with no host', { ...valid, site_url: 'https:///wp-admin' }],
		['a body that is not JSON', '{nope']
	])('answers 400 invalid_request for %s, before any lookup', async (_label, body) => {
		const response = await post(body);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false, code: 'invalid_request' });
		expect(findLicenseByKey).not.toHaveBeenCalled();
		expect(downloadableRelease).not.toHaveBeenCalled();
		expect(inserted).toHaveLength(0);
	});
});
