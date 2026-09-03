import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: crypto.ScryptOptions
) => Promise<Buffer>;

/*
 * scrypt, not a bare hash.
 *
 * The admin password is the one credential that mints licences and revokes
 * seats, and it is the only thing standing in front of every customer record.
 * A fast hash would make an offline attack on a leaked env file trivial; scrypt
 * makes it expensive in memory as well as time.
 *
 * N=2^15 costs ~50ms and ~32MB per verification, which is nothing for a login
 * that happens a few times a day and a great deal for an attacker doing it
 * billions of times.
 */
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEYLEN = 64;

/*
 * Fields are separated by '.', not the '$' that PHC-style hashes conventionally
 * use.
 *
 * Vite runs .env values through dotenv-expand, which treats `$32768` and
 * `$8` inside a value as variable references and substitutes them with nothing.
 * A '$'-separated hash therefore arrives at the server silently truncated, and
 * every login fails with "credentials not recognised" while the same hash
 * verifies fine from a Node CLI. That is a genuinely horrible afternoon, and it
 * costs one character to avoid.
 */
const SEP = '.';

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.randomBytes(16);
	const derived = await scrypt(password, salt, KEYLEN, PARAMS);
	return [
		'scrypt',
		PARAMS.N,
		PARAMS.r,
		PARAMS.p,
		salt.toString('base64url'),
		derived.toString('base64url')
	].join(SEP);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false for a malformed stored hash rather than throwing: a
 * misconfigured `ADMIN_PASSWORD_HASH` must lock the door, not open it with a
 * 500 that some proxy might treat as a pass.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split(SEP);
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

	const [, n, r, p, saltB64, hashB64] = parts;
	const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem };
	if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
		return false;
	}

	let expected: Buffer;
	try {
		expected = Buffer.from(hashB64, 'base64url');
		if (expected.length === 0) return false;
	} catch {
		return false;
	}

	try {
		const derived = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, params);
		return crypto.timingSafeEqual(derived, expected);
	} catch {
		return false;
	}
}
