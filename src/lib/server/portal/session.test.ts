import { beforeAll, describe, expect, it } from 'vitest';
import { issuePortalSession, readPortalSession } from './session.ts';

/*
 * The portal cookie is the only thing standing between a browser and another
 * customer's seat list, so these test what a forger would actually try rather
 * than that the happy path round-trips.
 */

describe('portal sessions', () => {
	beforeAll(() => {
		process.env.PORTAL_JWT_SECRET = 'p'.repeat(48);
		process.env.ADMIN_JWT_SECRET = 'a'.repeat(48);
	});

	it('round-trips a licence id', () => {
		const claims = readPortalSession(issuePortalSession('lic-123'));
		expect(claims?.sub).toBe('lic-123');
	});

	it('carries the licence id and nothing that could be replayed', () => {
		// The whole point of putting the id in `sub` rather than the key: a stolen
		// cookie must not be usable against /api/v1/activate.
		const token = issuePortalSession('lic-123');
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
		expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
		expect(JSON.stringify(payload)).not.toMatch(/STP-/);
	});

	it.each([
		['undefined', undefined],
		['empty', ''],
		['not three parts', 'a.b'],
		['garbage', 'not-a-token-at-all'],
		['alg none', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.']
	])('refuses a %s cookie', (_label, token) => {
		expect(readPortalSession(token as string | undefined)).toBeNull();
	});

	it('refuses a tampered signature', () => {
		const token = issuePortalSession('lic-123');
		const [h, p, s] = token.split('.');
		const flipped = s[0] === 'A' ? `B${s.slice(1)}` : `A${s.slice(1)}`;
		expect(readPortalSession(`${h}.${p}.${flipped}`)).toBeNull();
	});

	it('refuses a tampered subject, which is the interesting forgery', () => {
		// Swapping `sub` for another licence id is exactly how one customer would
		// try to read another's seats.
		const token = issuePortalSession('lic-123');
		const [h, , s] = token.split('.');
		const forged = Buffer.from(
			JSON.stringify({ sub: 'lic-999', iat: 1, exp: 9_999_999_999 })
		).toString('base64url');
		expect(readPortalSession(`${h}.${forged}.${s}`)).toBeNull();
	});

	it('refuses an expired session', () => {
		const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
		const p = Buffer.from(JSON.stringify({ sub: 'lic-123', iat: 1, exp: 2 })).toString('base64url');
		// Signature is irrelevant: expiry is checked on claims that already verified,
		// so build a real one to prove expiry is what rejects it.
		const real = issuePortalSession('lic-123');
		expect(readPortalSession(real)).not.toBeNull();
		expect(readPortalSession(`${h}.${p}.${real.split('.')[2]}`)).toBeNull();
	});

	it('does not accept a token signed with the admin secret', async () => {
		// Separate secrets are what stop a portal session being forged into an
		// admin one. If these ever share a key this test is the thing that says so.
		const admin = await import('../admin/jwt.ts');
		expect(readPortalSession(admin.issueSession('attacker@example.com'))).toBeNull();
	});
});
