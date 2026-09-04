import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('hashPassword', () => {
	it('produces the documented envelope', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash.split('.')).toHaveLength(6);
		expect(hash.startsWith('scrypt.32768.8.1.')).toBe(true);
	});

	it('contains no $, which dotenv-expand would eat out of a .env value', () => {
		// Regression: a '$'-separated envelope is silently truncated by Vite's
		// dotenv-expand, so every login fails while the same hash verifies from
		// a CLI. base64url has no '$' either, so this holds for the salt and
		// digest as well as the separators.
		return expect(hashPassword('correct horse battery staple')).resolves.not.toContain('$');
	});

	it('salts, so the same password never hashes to the same value', async () => {
		const a = await hashPassword('same password');
		const b = await hashPassword('same password');
		expect(a).not.toBe(b);
	});
});

describe('verifyPassword', () => {
	it('accepts the right password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
	});

	it('rejects the wrong one, including near misses', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false);
		expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
		expect(await verifyPassword('', hash)).toBe(false);
	});

	it('locks the door on a malformed hash rather than throwing', async () => {
		// A misconfigured ADMIN_PASSWORD_HASH must fail closed. Throwing here
		// would surface as a 500, which some proxies treat differently from a
		// clean refusal.
		for (const bad of ['', 'nonsense', 'scrypt.x.y.z.a.b', 'bcrypt.1.2.3.4.5', 'scrypt.32768.8.1.salt']) {
			expect(await verifyPassword('anything', bad)).toBe(false);
		}
	});

	it('rejects a hash whose digest is empty', async () => {
		expect(await verifyPassword('anything', 'scrypt.32768.8.1.c2FsdA.')).toBe(false);
	});
});
