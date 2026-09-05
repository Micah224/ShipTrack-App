import crypto from 'node:crypto';
import { optionalNumber, required } from '../env.ts';

export interface AdminClaims {
	sub: string;
	iat: number;
	exp: number;
}

/*
 * HS256 sessions, signed with a secret this deployment holds.
 *
 * Symmetric rather than the Ed25519 pair used for entitlements, and
 * deliberately so: an entitlement is verified by software we do not control
 * (the plugin), which is exactly when asymmetric signing earns its cost. A
 * session cookie is only ever verified by the process that issued it, so a
 * shared secret is the simpler correct answer.
 */
function secret(): Buffer {
	const value = required('ADMIN_JWT_SECRET');
	if (value.length < 32) {
		throw new Error('ADMIN_JWT_SECRET must be at least 32 characters.');
	}
	return Buffer.from(value, 'utf8');
}

export function sessionTtlSeconds(): number {
	return optionalNumber('ADMIN_SESSION_HOURS', 12) * 3600;
}

function sign(message: string): string {
	return crypto.createHmac('sha256', secret()).update(message).digest('base64url');
}

export function issueSession(subject: string): string {
	const iat = Math.floor(Date.now() / 1000);
	const claims: AdminClaims = { sub: subject, iat, exp: iat + sessionTtlSeconds() };
	const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

/**
 * Verifies a session token, returning its claims or null.
 *
 * The signature is checked before the payload is parsed and compared in
 * constant time, so neither a forged token nor a malformed one reveals
 * anything through timing or through a different error.
 */
export function readSession(token: string | undefined): AdminClaims | null {
	if (!token) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [header, payload, signature] = parts;

	const expected = sign(`${header}.${payload}`);
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

	let claims: AdminClaims;
	try {
		claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}

	if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
	if (claims.exp <= Math.floor(Date.now() / 1000)) return null;

	return claims;
}

export const SESSION_COOKIE = 'stp_admin';
