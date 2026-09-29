import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { License } from '$lib/server/db/schema';
import { findLicenseByKey } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss, type LimitOutcome } from '$lib/server/domain/limits';
import { downloadableReleases, type ReleaseListing } from '$lib/server/domain/releases';
import { POST } from './+server';

/*
 * The handler's database-backed steps are stubbed; everything between them —
 * validation, state, the changelog sanitiser and the response shape — runs for
 * real.
 */
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
	downloadableReleases: vi.fn(async () => listing)
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

function release(version: string, changelogHtml: string | null, publishedAt: string): ReleaseListing {
	return {
		id: `id-${version}`,
		tag: `v${version}`,
		version,
		minPhp: '8.1',
		minWp: '6.5',
		testedUpTo: '7.0',
		r2StorageKey: `releases/shiptrack-pro-${version}.zip`,
		fileSize: 1024,
		fileSha256: 'f'.repeat(64),
		downloadCount: 0,
		publishedAt: new Date(publishedAt),
		changelogHtml,
		changelogLength: changelogHtml?.length ?? 0
	};
}

let listing: ReleaseListing[];

beforeEach(() => {
	listing = [
		release('5.2.0', '<h2>5.2.0</h2><ul><li>Rollback</li></ul>', '2026-09-20T09:00:00Z'),
		release('5.1.1', '<p>ok</p><img src=x onerror=alert(1)>', '2026-09-10T09:00:00Z'),
		release('5.1.0', null, '2026-09-01T09:00:00Z')
	];
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

function post(body: unknown) {
	const request = new Request('https://licence.test/api/v1/updates/versions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

const valid = { key: 'STP-TEST-TEST-TEST', site_url: 'https://owlex.example.com' };

describe('POST /api/v1/updates/versions', () => {
	it('lists downloadable versions newest first, with the latest marked', async () => {
		const response = await post(valid);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.versions).toEqual([
			{
				version: '5.2.0',
				published_at: '2026-09-20T09:00:00.000Z',
				changelog_html: '<h2>5.2.0</h2><ul><li>Rollback</li></ul>',
				latest: true
			},
			{ version: '5.1.1', published_at: '2026-09-10T09:00:00.000Z', changelog_html: '<p>ok</p>', latest: false },
			{
				version: '5.1.0',
				published_at: '2026-09-01T09:00:00.000Z',
				changelog_html: '<p>No changelog was published for this release.</p>',
				latest: false
			}
		]);
		expect(downloadableReleases).toHaveBeenCalledOnce();
		expect(meterLicense).toHaveBeenCalledWith('updates', license);
		expect(response.headers.get('ratelimit-remaining')).toBe('57');
	});

	it('sanitises every changelog on the way out', async () => {
		const body = await (await post(valid)).json();
		expect(JSON.stringify(body.versions)).not.toContain('onerror');
	});

	it('shortens a very long changelog, and says so', async () => {
		const long = `<ul>${'<li>A change worth mentioning.</li>'.repeat(600)}</ul>`;
		listing = [{ ...release('5.2.0', long.slice(0, 8000), '2026-09-20T09:00:00Z'), changelogLength: long.length }];

		const body = await (await post(valid)).json();
		const html: string = body.versions[0].changelog_html;

		expect(html.length).toBeLessThanOrEqual(8000 + 64);
		expect(html).toMatch(/<\/li><\/ul><p><em>Changelog shortened\.<\/em><\/p>$/);
	});

	it('answers an empty list, not a 404, when nothing has been released', async () => {
		listing = [];
		const response = await post(valid);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, versions: [] });
	});

	it('refuses an unknown key, metered on the miss bucket only', async () => {
		vi.mocked(findLicenseByKey).mockResolvedValueOnce(undefined);

		const response = await post(valid);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ ok: false, code: 'unknown_key' });
		expect(meterMiss).toHaveBeenCalledOnce();
		expect(meterLicense).not.toHaveBeenCalled();
		expect(downloadableReleases).not.toHaveBeenCalled();
	});

	it('answers 429 once the miss bucket is spent', async () => {
		vi.mocked(findLicenseByKey).mockResolvedValueOnce(undefined);
		vi.mocked(meterMiss).mockResolvedValueOnce({ ...open, limited: true, worst: open.all[0] });

		const response = await post(valid);

		expect(response.status).toBe(429);
		expect(await response.json()).toMatchObject({ code: 'rate_limited' });
	});

	it('answers 429 when the licence is over its updates budget', async () => {
		vi.mocked(meterLicense).mockResolvedValueOnce({ ...open, limited: true, worst: open.all[0] });

		const response = await post(valid);

		expect(response.status).toBe(429);
		expect(downloadableReleases).not.toHaveBeenCalled();
	});

	it.each([
		['REVOKED', { status: 'REVOKED' }, 'license_revoked'],
		['SUSPENDED', { status: 'SUSPENDED' }, 'license_suspended'],
		['past its grace period', { expiresAt: new Date('2026-01-01T00:00:00Z') }, 'license_expired']
	])('refuses a licence that is %s', async (_label, overrides, code) => {
		vi.mocked(findLicenseByKey).mockResolvedValueOnce({ ...license, ...overrides } as License);

		const response = await post(valid);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ ok: false, code });
		expect(downloadableReleases).not.toHaveBeenCalled();
	});

	it('still serves a licence in its grace period', async () => {
		const yesterday = new Date(Date.now() - 86_400_000);
		vi.mocked(findLicenseByKey).mockResolvedValueOnce({ ...license, expiresAt: yesterday } as License);

		expect((await post(valid)).status).toBe(200);
	});

	it.each([
		['no key', { site_url: valid.site_url }],
		['a numeric key', { ...valid, key: 12345 }],
		['an over-long key', { ...valid, key: 'x'.repeat(129) }],
		['no site_url', { key: valid.key }],
		['a site_url with no host', { ...valid, site_url: 'not a url' }],
		['a body that is not JSON', '{nope']
	])('answers 400 invalid_request for %s, before any lookup', async (_label, body) => {
		const response = await post(body);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false, code: 'invalid_request' });
		expect(findLicenseByKey).not.toHaveBeenCalled();
		expect(meterMiss).not.toHaveBeenCalled();
	});
});
