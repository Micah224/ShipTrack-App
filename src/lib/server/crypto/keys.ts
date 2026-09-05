import crypto from 'node:crypto';
import { required } from '../env.ts';

/*
 * Licence key format.
 *
 * 20 bytes of CSPRNG output rendered in Crockford base32 — no I, L, O or U, so
 * a customer reading a key down the phone cannot turn a 1 into an I. Grouped in
 * fours because that is what people can retype without losing their place.
 *
 *   STP-4F2A-9K7M-2XQR-8VNB-3HTY-6JWD-5PGZ
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_BYTES = 20;
const GROUP = 4;
export const KEY_PREFIX = 'STP';

function toCrockford(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += CROCKFORD[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		out += CROCKFORD[(value << (5 - bits)) & 31];
	}
	return out;
}

export function generateLicenseKey(): string {
	const raw = toCrockford(crypto.randomBytes(KEY_BYTES));
	const groups: string[] = [];
	for (let i = 0; i < raw.length; i += GROUP) {
		groups.push(raw.slice(i, i + GROUP));
	}
	return [KEY_PREFIX, ...groups].join('-');
}

/**
 * Normalises a key as typed by a human: trims, uppercases, strips everything
 * that is not a base32 character, then regroups. `stp 4f2a9k7m…` and
 * `STP-4F2A-9K7M-…` are the same key.
 */
export function normalizeLicenseKey(input: string): string {
	const cleaned = input.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
	const body = cleaned.startsWith(KEY_PREFIX) ? cleaned.slice(KEY_PREFIX.length) : cleaned;
	const groups: string[] = [];
	for (let i = 0; i < body.length; i += GROUP) {
		groups.push(body.slice(i, i + GROUP));
	}
	return [KEY_PREFIX, ...groups].join('-');
}

/** The O(1) lookup column. Hex sha256 of the normalised key. */
export function hashLicenseKey(key: string): string {
	return crypto.createHash('sha256').update(normalizeLicenseKey(key)).digest('hex');
}

/** First group only — `STP-4F2A`. Plaintext, for support search. */
export function licenseKeyPrefix(key: string): string {
	const parts = normalizeLicenseKey(key).split('-');
	return parts.slice(0, 2).join('-');
}

function keyCipherSecret(): Buffer {
	const secret = required('LICENSE_KEY_SECRET');
	const raw = Buffer.from(secret, 'base64');
	if (raw.length !== 32) {
		throw new Error('LICENSE_KEY_SECRET must be 32 bytes, base64-encoded.');
	}
	return raw;
}

/**
 * AES-256-GCM. Output is `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 *
 * The version prefix is what makes rotating the secret possible later without
 * guessing at how an old value was encoded.
 */
export function encryptLicenseKey(key: string): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', keyCipherSecret(), iv);
	const ciphertext = Buffer.concat([cipher.update(normalizeLicenseKey(key), 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		'v1',
		iv.toString('base64url'),
		tag.toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

export function decryptLicenseKey(payload: string): string {
	const [version, iv, tag, ciphertext] = payload.split('.');
	if (version !== 'v1' || !iv || !tag || !ciphertext) {
		throw new Error('Unrecognised licence key ciphertext.');
	}
	const decipher = crypto.createDecipheriv(
		'aes-256-gcm',
		keyCipherSecret(),
		Buffer.from(iv, 'base64url')
	);
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, 'base64url')),
		decipher.final()
	]).toString('utf8');
}

/** A download token: opaque, single-use, stored only as its hash. */
export function generateDownloadToken(): { token: string; hash: string } {
	const token = `tok_${crypto.randomBytes(24).toString('base64url')}`;
	return { token, hash: hashDownloadToken(token) };
}

export function hashDownloadToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}
