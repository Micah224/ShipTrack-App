import { describe, expect, it } from 'vitest';
import {
	decryptLicenseKey,
	encryptLicenseKey,
	generateDownloadToken,
	generateLicenseKey,
	hashDownloadToken,
	hashLicenseKey,
	licenseKeyPrefix,
	normalizeLicenseKey
} from './keys.ts';

// 32 zero bytes, base64. Set before the module reads it, which it does lazily.
process.env.LICENSE_KEY_SECRET = Buffer.alloc(32, 7).toString('base64');

describe('generateLicenseKey', () => {
	it('produces the documented shape', () => {
		expect(generateLicenseKey()).toMatch(/^STP(-[0-9A-HJKMNP-TV-Z]{4}){8}$/);
	});

	it('does not repeat', () => {
		const keys = new Set(Array.from({ length: 200 }, generateLicenseKey));
		expect(keys.size).toBe(200);
	});

	it('avoids the ambiguous Crockford letters', () => {
		const body = Array.from({ length: 50 }, generateLicenseKey).join('').replace(/STP|-/g, '');
		expect(body).not.toMatch(/[ILOU]/);
	});
});

describe('normalizeLicenseKey', () => {
	it('accepts a key as a human retypes it', () => {
		const key = generateLicenseKey();
		const mangled = key.toLowerCase().replace(/-/g, ' ');
		expect(normalizeLicenseKey(mangled)).toBe(key);
	});

	it('hashes to the same value however it was typed', () => {
		const key = generateLicenseKey();
		expect(hashLicenseKey(key.replace(/-/g, '').toLowerCase())).toBe(hashLicenseKey(key));
	});
});

describe('licenseKeyPrefix', () => {
	it('keeps the first group only', () => {
		expect(licenseKeyPrefix('STP-4F2A-9K7M-2XQR-8VNB-3HTY-6JWD-5PGZ-1234')).toBe('STP-4F2A');
	});
});

describe('encryptLicenseKey', () => {
	it('round-trips', () => {
		const key = generateLicenseKey();
		expect(decryptLicenseKey(encryptLicenseKey(key))).toBe(key);
	});

	it('is non-deterministic, so equal keys do not produce equal ciphertext', () => {
		const key = generateLicenseKey();
		expect(encryptLicenseKey(key)).not.toBe(encryptLicenseKey(key));
	});

	it('refuses a tampered ciphertext rather than returning garbage', () => {
		const cipher = encryptLicenseKey(generateLicenseKey());
		const parts = cipher.split('.');
		parts[3] = Buffer.from('tampered').toString('base64url');
		expect(() => decryptLicenseKey(parts.join('.'))).toThrow();
	});

	it('rejects an unrecognised envelope', () => {
		expect(() => decryptLicenseKey('nonsense')).toThrow(/Unrecognised/);
	});
});

describe('download tokens', () => {
	it('hashes consistently and uniquely', () => {
		const { token, hash } = generateDownloadToken();
		expect(token).toMatch(/^tok_/);
		expect(hashDownloadToken(token)).toBe(hash);
		expect(generateDownloadToken().hash).not.toBe(hash);
	});
});
