import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawPublicKeyBase64 } from '$lib/server/crypto/ed25519';
import { GET } from './+server';

let publicPem: string;

beforeEach(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	vi.stubEnv('ED25519_PRIVATE_KEY', pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
	vi.stubEnv('ED25519_KEY_ID', 'stp-probe');
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

const probe = () => GET({} as Parameters<typeof GET>[0]);

describe('GET /api/v1/heartbeat', () => {
	it('names the signing key, in the form the plugin lists it', async () => {
		const response = await probe();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			service: 'shiptrack-licence',
			ready: true,
			kid: 'stp-probe',
			public_key: rawPublicKeyBase64(publicPem)
		});
	});

	/*
	 * The probe answered "ready: true" for five days while every activation
	 * failed on a signing key it could not load.
	 */
	it('is not ready, with a 503 and the reason logged, when it cannot sign', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubEnv('ED25519_PRIVATE_KEY', publicPem);

		const response = await probe();

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			ok: false,
			service: 'shiptrack-licence',
			ready: false,
			problems: ['signing']
		});
		expect(logged).toHaveBeenCalledWith(expect.stringMatching(/not ready: ED25519_PRIVATE_KEY is not usable/));
	});

	it('does not put the reason in the public response', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubEnv('ED25519_KEY_ID', undefined);
		const text = await (await probe()).text();
		expect(text).not.toMatch(/ED25519|environment/);
	});
});
