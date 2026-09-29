import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyLicenseToken } from '$lib/server/crypto/ed25519';
import type { License } from '$lib/server/db/schema';
import { claimSeat } from '$lib/server/domain/seats';
import { POST } from './+server';

/*
 * The handler's database-backed steps are stubbed; everything between them
 * runs for real, signing included.
 */
vi.mock('$lib/server/domain/licenses', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/domain/licenses')>()),
	findLicenseByKey: vi.fn(async () => license),
	audit: vi.fn(async () => {})
}));
vi.mock('$lib/server/domain/limits', () => ({
	meterLicense: vi.fn(async () => ({ limited: false, worst: null, all: [], observedOnly: false })),
	meterMiss: vi.fn()
}));
vi.mock('$lib/server/domain/seats', () => ({
	claimSeat: vi.fn(async () => ({ ok: true, activation: {}, used: 1 }))
}));

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

const saved = { key: process.env.ED25519_PRIVATE_KEY, kid: process.env.ED25519_KEY_ID };
let publicPem: string;

beforeEach(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	process.env.ED25519_PRIVATE_KEY = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
	process.env.ED25519_KEY_ID = 'stp-activate';
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
	vi.mocked(claimSeat).mockClear();
});

afterEach(() => {
	process.env.ED25519_PRIVATE_KEY = saved.key;
	process.env.ED25519_KEY_ID = saved.kid;
	vi.restoreAllMocks();
});

function activate() {
	const request = new Request('https://licence.test/api/v1/activate', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			key: 'STP-TEST-TEST-TEST',
			site_url: 'https://owlex.example.com',
			install_id: 'ef74dd46-d018-4e63-b2c2-0f2342589fca',
			plugin_version: '5.2.0'
		})
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

describe('POST /api/v1/activate', () => {
	it('claims the seat and returns a token the plugin can verify', async () => {
		const response = await activate();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(claimSeat).toHaveBeenCalledOnce();
		expect(verifyLicenseToken(body.token, publicPem)).toMatchObject({
			domain: 'owlex.example.com',
			install: 'ef74dd46-d018-4e63-b2c2-0f2342589fca'
		});
	});

	/*
	 * From 2026-09-24 every activation claimed its seat, then died signing: the
	 * customer saw "Internal Error" and the seat stayed taken.
	 */
	it('claims nothing, and answers a coded 503, when it cannot sign', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		process.env.ED25519_PRIVATE_KEY = 'ED25519_PRIVATE_KEY=not-a-key';

		const response = await activate();

		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('300');
		expect(await response.json()).toMatchObject({ ok: false, code: 'service_unavailable' });
		expect(claimSeat).not.toHaveBeenCalled();
		expect(logged).toHaveBeenCalledWith(expect.stringMatching(/cannot sign entitlements: ED25519_PRIVATE_KEY/));
	});
});
