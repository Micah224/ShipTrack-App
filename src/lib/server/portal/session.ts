import crypto from 'node:crypto';
import { optionalNumber, required } from '../env.ts';

/*
 * Customer portal sessions.
 *
 * WHY THE LICENCE KEY IS THE CREDENTIAL
 *   There are no customer passwords anywhere in this system, and adding some
 *   would mean storing a second secret per customer, a reset flow, and an email
 *   sender — three new things to get wrong in exchange for no extra security.
 *   The licence key already IS the customer's credential: it is 20 CSPRNG bytes,
 *   it is what their WordPress site authenticates with, and anyone holding it
 *   can already read the same data through /api/v1/activate. The portal grants
 *   no capability the key did not already carry.
 *
 * WHAT THE SESSION HOLDS, AND WHAT IT DOES NOT
 *   `sub` is the licence id, never the key and never the key hash. So the cookie
 *   cannot be replayed against the licence API, and a leaked session expires on
 *   its own rather than handing over a credential that does not.
 *
 * SEPARATE SECRET FROM THE ADMIN CONSOLE
 *   A portal session must never be forgeable into an admin session, and the
 *   cheapest way to guarantee that is for the two to be signed by different
 *   keys. Sharing ADMIN_JWT_SECRET would make the difference a matter of the
 *   `sub` claim being interpreted correctly in every future code path, which is
 *   a promise about code yet to be written.
 */

export const PORTAL_COOKIE = 'stp_portal';

export interface PortalClaims {
	/** The licence id. Deliberately not the key or its hash. */
	sub: string;
	iat: number;
	exp: number;
}

function secret(): Buffer {
	const value = required('PORTAL_JWT_SECRET');
	if (value.length < 32) {
		throw new Error('PORTAL_JWT_SECRET must be at least 32 characters.');
	}
	return Buffer.from(value, 'utf8');
}

export function portalTtlSeconds(): number {
	return optionalNumber('PORTAL_SESSION_HOURS', 8) * 3600;
}

function sign(message: string): string {
	return crypto.createHmac('sha256', secret()).update(message).digest('base64url');
}

export function issuePortalSession(licenseId: string): string {
	const iat = Math.floor(Date.now() / 1000);
	const claims: PortalClaims = { sub: licenseId, iat, exp: iat + portalTtlSeconds() };
	const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

/**
 * Reads a portal cookie, returning null for anything that is not a valid,
 * unexpired session this deployment signed.
 *
 * Never throws. A malformed cookie is an unauthenticated request, not a 500 —
 * the caller is a browser we do not control and a crash would be a denial of
 * service anyone could trigger with a bad cookie.
 */
export function readPortalSession(token: string | undefined): PortalClaims | null {
	if (!token) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;

	const [header, payload, signature] = parts;

	const expected = sign(`${header}.${payload}`);
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	// Length check first: timingSafeEqual throws on a length mismatch.
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

	try {
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PortalClaims;
		if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
		if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
		return claims;
	} catch {
		return null;
	}
}
