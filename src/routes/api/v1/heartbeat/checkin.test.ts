import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyLicenseToken } from '$lib/server/crypto/ed25519';
import { getDb } from '$lib/server/db';
import type { License } from '$lib/server/db/schema';
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

const saved = { key: process.env.ED25519_PRIVATE_KEY, kid: process.env.ED25519_KEY_ID };
let publicPem: string;

beforeEach(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	process.env.ED25519_PRIVATE_KEY = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
	process.env.ED25519_KEY_ID = 'stp-heartbeat';
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
	update.mockClear();
});

afterEach(() => {
	process.env.ED25519_PRIVATE_KEY = saved.key;
	process.env.ED25519_KEY_ID = saved.kid;
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

	it('records nothing, and answers a coded 503, when it cannot sign', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		process.env.ED25519_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMC4CAQAw';

		const response = await heartbeat();

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ ok: false, code: 'service_unavailable' });
		expect(update).not.toHaveBeenCalled();
	});
});
