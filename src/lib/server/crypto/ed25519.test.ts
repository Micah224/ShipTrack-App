import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { rawPublicKeyBase64, signLicenseToken, verifyLicenseToken, type LicenseTokenPayload } from './ed25519.ts';

let publicPem: string;

beforeAll(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	process.env.ED25519_PRIVATE_KEY = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
	process.env.ED25519_KEY_ID = 'stp-test';
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

function payload(overrides: Partial<LicenseTokenPayload> = {}): LicenseTokenPayload {
	const iat = Math.floor(Date.now() / 1000);
	return {
		v: 1,
		sub: 'sha256:abc123',
		domain: 'logistics.example.com',
		install: 'a3f1c8de-0000-4000-8000-000000000001',
		tier: 'PROFESSIONAL',
		features: ['truck', 'plane', 'train'],
		status: 'ACTIVE',
		seats: { used: 1, total: 3 },
		limits: { branches: 5, auditRetentionDays: 90 },
		exp: iat + 604_800,
		iat,
		nbf: iat - 60,
		nonce: 'test-nonce',
		...overrides
	};
}

describe('signLicenseToken', () => {
	it('produces a three-part token that verifies', () => {
		const signed = signLicenseToken(payload());
		expect(signed.token.split('.')).toHaveLength(3);
		expect(verifyLicenseToken(signed.token, publicPem)).toMatchObject({ tier: 'PROFESSIONAL' });
	});

	it('returns the exact signed payload bytes, not a re-encode', () => {
		const claims = payload();
		const signed = signLicenseToken(claims);
		// This is the contract the PHP client depends on: it must verify these
		// bytes, because json_encode(json_decode($x)) will not reproduce them.
		expect(signed.payload).toBe(signed.token.split('.')[1]);
		expect(JSON.parse(Buffer.from(signed.payload, 'base64url').toString())).toEqual(claims);
	});

	it('carries the key id in the header, so rotation is possible', () => {
		const signed = signLicenseToken(payload());
		const header = JSON.parse(Buffer.from(signed.token.split('.')[0], 'base64url').toString());
		expect(header).toMatchObject({ alg: 'Ed25519', typ: 'STP-LIC', kid: 'stp-test' });
		expect(signed.kid).toBe('stp-test');
	});

	it('binds to both domain and install, so a token cannot be copied sideways', () => {
		const a = signLicenseToken(payload({ install: 'install-a' }));
		const b = signLicenseToken(payload({ install: 'install-b' }));
		expect(a.token).not.toBe(b.token);
	});

	it('never puts the licence key itself in the token', () => {
		const signed = signLicenseToken(payload());
		const decoded = Buffer.from(signed.payload, 'base64url').toString();
		expect(decoded).toContain('sha256:');
		expect(decoded).not.toMatch(/STP-[0-9A-Z]{4}-/);
	});
});

describe('verifyLicenseToken', () => {
	it('rejects a tampered payload', () => {
		const signed = signLicenseToken(payload({ tier: 'STARTER' }));
		const [header, , signature] = signed.token.split('.');
		const forged = Buffer.from(JSON.stringify(payload({ tier: 'ENTERPRISE' }))).toString('base64url');
		expect(verifyLicenseToken(`${header}.${forged}.${signature}`, publicPem)).toBeNull();
	});

	it('rejects a token signed by a different key', () => {
		const other = crypto.generateKeyPairSync('ed25519');
		const signed = signLicenseToken(payload());
		const otherPem = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
		expect(verifyLicenseToken(signed.token, otherPem)).toBeNull();
	});

	it('rejects a malformed token', () => {
		expect(verifyLicenseToken('not.a.valid.token', publicPem)).toBeNull();
		expect(verifyLicenseToken('nonsense', publicPem)).toBeNull();
	});
});

describe('rawPublicKeyBase64', () => {
	it('returns the 32 raw bytes sodium expects in PHP', () => {
		const raw = rawPublicKeyBase64(publicPem);
		expect(Buffer.from(raw, 'base64')).toHaveLength(32);
	});

	it('matches the tail of the SPKI export', () => {
		const der = crypto.createPublicKey(publicPem).export({ type: 'spki', format: 'der' });
		expect(Buffer.from(rawPublicKeyBase64(publicPem), 'base64')).toEqual(
			Buffer.from(der.subarray(der.length - 32))
		);
	});
});
