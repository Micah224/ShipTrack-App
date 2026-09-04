import crypto from 'node:crypto';
import { optional, required } from '../env';

/**
 * The claims the WordPress plugin verifies offline.
 *
 * `sub` is the *hash* of the licence key, never the key: a token that leaks
 * must not hand over the credential it was minted from. The plugin already
 * holds the key it typed in, so it has nothing to gain from the plaintext.
 *
 * `domain` and `install` together are what stop a valid token being copied
 * between sites. Without `install`, one token covers every site on a domain;
 * without `domain`, it covers every site full stop.
 */
export interface LicenseTokenPayload {
	v: 1;
	sub: string;
	domain: string;
	install: string;
	tier: string;
	features: string[];
	status: string;
	seats: { used: number; total: number };
	limits: { branches: number | null; auditRetentionDays: number | null };
	exp: number | null;
	iat: number;
	nbf: number;
	nonce: string;
}

export interface SignedToken {
	token: string;
	/** The exact bytes that were signed, base64url. The plugin must verify these. */
	payload: string;
	kid: string;
}

const ALG = 'Ed25519';
const TYP = 'STP-LIC';

function privateKey(): crypto.KeyObject {
	return crypto.createPrivateKey({ key: required('ED25519_PRIVATE_KEY'), format: 'pem' });
}

export function activeKeyId(): string {
	return optional('ED25519_KEY_ID', 'stp-2026a');
}

/**
 * Signs the entitlement.
 *
 * The signed message is `base64url(header).base64url(payload)` and the response
 * carries those exact bytes back. The plugin must verify what it was given, not
 * a re-encode: `json_encode(json_decode($x))` will not reproduce this byte
 * sequence — key order, slash escaping and float formatting all differ — and a
 * scheme built that way fails on some hosts and not others.
 */
export function signLicenseToken(payload: LicenseTokenPayload): SignedToken {
	const kid = activeKeyId();
	const header = { alg: ALG, typ: TYP, kid };
	const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
	const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const message = `${b64Header}.${b64Payload}`;
	const signature = crypto.sign(null, Buffer.from(message), privateKey());
	return {
		token: `${message}.${signature.toString('base64url')}`,
		payload: b64Payload,
		kid
	};
}

/**
 * Server-side counterpart, used by the tests and by the mint CLI to prove a
 * freshly generated keypair actually round-trips before it is installed.
 */
export function verifyLicenseToken(token: string, publicKeyPem: string): LicenseTokenPayload | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [b64Header, b64Payload, b64Signature] = parts;
	const ok = crypto.verify(
		null,
		Buffer.from(`${b64Header}.${b64Payload}`),
		crypto.createPublicKey({ key: publicKeyPem, format: 'pem' }),
		Buffer.from(b64Signature, 'base64url')
	);
	if (!ok) return null;
	try {
		return JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

/** Base64 of the raw 32-byte public key — the form sodium wants in PHP. */
export function rawPublicKeyBase64(publicKeyPem: string): string {
	const der = crypto
		.createPublicKey({ key: publicKeyPem, format: 'pem' })
		.export({ type: 'spki', format: 'der' });
	// An Ed25519 SPKI blob is a 12-byte header followed by the 32 key bytes.
	return Buffer.from(der.subarray(der.length - 32)).toString('base64');
}

export function newNonce(): string {
	return crypto.randomBytes(16).toString('base64url');
}
