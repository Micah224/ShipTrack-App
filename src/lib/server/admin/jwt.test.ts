import { beforeAll, describe, expect, it, vi } from 'vitest';
import { issueSession, readSession } from './jwt.ts';

beforeAll(() => {
	process.env.ADMIN_JWT_SECRET = 'a'.repeat(48);
});

describe('issueSession', () => {
	it('round-trips the subject', () => {
		const claims = readSession(issueSession('ops@example.com'));
		expect(claims?.sub).toBe('ops@example.com');
	});

	it('sets an expiry in the future', () => {
		const claims = readSession(issueSession('ops@example.com'));
		expect(claims!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
	});
});

describe('readSession', () => {
	it('rejects absent, malformed and empty tokens', () => {
		expect(readSession(undefined)).toBeNull();
		expect(readSession('')).toBeNull();
		expect(readSession('not-a-jwt')).toBeNull();
		expect(readSession('a.b')).toBeNull();
		expect(readSession('a.b.c.d')).toBeNull();
	});

	it('rejects a tampered payload', () => {
		const [header, , signature] = issueSession('ops@example.com').split('.');
		const forged = Buffer.from(
			JSON.stringify({ sub: 'attacker@example.com', iat: 1, exp: 9_999_999_999 })
		).toString('base64url');
		expect(readSession(`${header}.${forged}.${signature}`)).toBeNull();
	});

	it('rejects a token signed with a different secret', () => {
		const token = issueSession('ops@example.com');
		process.env.ADMIN_JWT_SECRET = 'b'.repeat(48);
		expect(readSession(token)).toBeNull();
		process.env.ADMIN_JWT_SECRET = 'a'.repeat(48);
	});

	it('rejects an expired session', () => {
		const token = issueSession('ops@example.com');
		// Twelve hours and change later.
		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 13 * 3600 * 1000);
		expect(readSession(token)).toBeNull();
		vi.restoreAllMocks();
	});

	it('refuses to run with a short secret rather than signing weakly', () => {
		process.env.ADMIN_JWT_SECRET = 'tooshort';
		expect(() => issueSession('ops@example.com')).toThrow(/at least 32/);
		process.env.ADMIN_JWT_SECRET = 'a'.repeat(48);
	});

	it('refuses the alg=none style token where the signature is dropped', () => {
		const [header, payload] = issueSession('ops@example.com').split('.');
		expect(readSession(`${header}.${payload}.`)).toBeNull();
	});
});
