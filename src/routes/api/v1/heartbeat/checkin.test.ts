import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyLicenseToken } from '$lib/server/crypto/ed25519';
import { getDb } from '$lib/server/db';
import type { License } from '$lib/server/db/schema';
import { findLicenseByKey } from '$lib/server/domain/licenses';
import { meterLicense } from '$lib/server/domain/limits';
import { findActivation } from '$lib/server/domain/seats';
import type { Activation } from '$lib/server/db/schema';
import { POST } from './+server';

/*
 * The handler's database-backed steps are stubbed; everything between them
 * runs for real, signing included.
 */
const update = vi.fn(() => ({ set: () => ({ where: async () => {} }) }));
vi.mock('$lib/server/db', () => ({ getDb: vi.fn(() => ({ update })) }));
vi.mock('$lib/server/domain/licenses', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domain/licenses')>()),
	findLicenseByKey: vi.fn(async () => license)
}));
vi.mock('$lib/server/domain/limits', () => ({
	meterLicense: vi.fn(async () => ({ limited: false, worst: null, all: [], observedOnly: false })),
	meterMiss: vi.fn()
}));
vi.mock('$lib/server/domain/seats', () => ({
	findActivation: vi.fn(async () => ({
		id: 'a1',
		domain: 'owlex.example.com',
		installId: 'ef74dd46-d018-4e63-b2c2-0f2342589fca',
		releasedAt: null,
		transportModesUsed: []
	})),
	countSeats: vi.fn(async () => 1)
}));
vi.mock('$lib/server/domain/releases', () => ({ latestRelease: vi.fn(async () => ({ version: '5.2.0' })) }));

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

let publicPem: string;

beforeEach(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	vi.stubEnv('ED25519_PRIVATE_KEY', pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
	vi.stubEnv('ED25519_KEY_ID', 'stp-heartbeat');
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function heartbeat() {
	const request = new Request('https://licence.test/api/v1/heartbeat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			key: 'STP-TEST-TEST-TEST',
			site_url: 'https://owlex.example.com',
			install_id: 'ef74dd46-d018-4e63-b2c2-0f2342589fca'
		})
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

describe('POST /api/v1/heartbeat', () => {
	it('records the check-in and re-signs the entitlement', async () => {
		const response = await heartbeat();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(getDb).toHaveBeenCalled();
		expect(update).toHaveBeenCalledOnce();
		expect(body.latest_version).toBe('5.2.0');
		expect(verifyLicenseToken(body.token, publicPem)).toMatchObject({ domain: 'owlex.example.com' });
	});

	/*
	 * The plugin locks itself on `not_activated`, so it must be distinct from
	 * `invalid_request` — which a malformed request produces, and which must
	 * never lock a site.
	 */
	it('answers 409 not_activated, and records nothing, for an install whose seat was released', async () => {
		vi.mocked(findActivation).mockResolvedValueOnce({
			id: 'a1',
			domain: 'owlex.example.com',
			releasedAt: new Date('2026-09-28T10:00:00Z'),
			releaseReason: 'SELF_SERVICE'
		} as Activation);

		const response = await heartbeat();

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			ok: false,
			code: 'not_activated',
			message: "This install's seat was released. Activate the licence on this site again to use it.",
			released_at: '2026-09-28T10:00:00.000Z',
			release_reason: 'self_service'
		});
		expect(update).not.toHaveBeenCalled();
	});

	it('names a reclaimed seat as auto_reclaim', async () => {
		vi.mocked(findActivation).mockResolvedValueOnce({
			id: 'a1',
			domain: 'owlex.example.com',
			releasedAt: new Date('2026-09-28T10:00:00Z'),
			releaseReason: 'AUTO_RECLAIM'
		} as Activation);

		const body = await (await heartbeat()).json();

		expect(body).toMatchObject({ code: 'not_activated', release_reason: 'auto_reclaim' });
	});

	it('answers 409 not_activated for an install that never activated', async () => {
		vi.mocked(findActivation).mockResolvedValueOnce(undefined);

		const response = await heartbeat();

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			ok: false,
			code: 'not_activated',
			released_at: null,
			release_reason: null
		});
		expect(update).not.toHaveBeenCalled();
	});

	it('keeps invalid_request for a malformed request', async () => {
		const request = new Request('https://licence.test/api/v1/heartbeat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ key: 'STP-TEST-TEST-TEST', site_url: 'https://owlex.example.com' })
		});

		const response = await POST({ request } as Parameters<typeof POST>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: 'invalid_request' });
		expect(findActivation).not.toHaveBeenCalled();
	});

	it('records nothing, and answers a coded 503, when it cannot sign', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubEnv('ED25519_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nMC4CAQAw');

		const response = await heartbeat();

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ ok: false, code: 'service_unavailable' });
		expect(update).not.toHaveBeenCalled();
		expect(findLicenseByKey).not.toHaveBeenCalled();
		expect(meterLicense).not.toHaveBeenCalled();
	});
});
