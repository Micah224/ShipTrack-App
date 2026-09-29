import crypto from 'node:crypto';
import { required } from '../env.ts';

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

const VARIABLE = 'ED25519_PRIVATE_KEY';

/** Block labels a refusal may name. Any other label came from the stored value, and is not echoed. */
const KNOWN_LABELS = new Set([
	'OPENSSH PRIVATE KEY',
	'EC PRIVATE KEY',
	'RSA PRIVATE KEY',
	'DSA PRIVATE KEY',
	'ENCRYPTED PRIVATE KEY',
	'RSA PUBLIC KEY',
	'CERTIFICATE'
]);

/**
 * Why the stored signing key cannot be used.
 *
 * Every message names what was found (a public key, two keys, a copy cut
 * short) and never any part of the value: it reaches the logs, and the only
 * useful thing in a private key is the thing that must not leak.
 */
export class SigningKeyError extends Error {
	constructor(reason: string) {
		super(
			`${VARIABLE} is not usable: ${reason}. It must hold the private key from \`npm run keys:generate\`, ` +
				'from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY----- (docs/operations/key-setup.md).'
		);
		this.name = 'SigningKeyError';
	}
}

function privateKey(): crypto.KeyObject {
	return loadPrivateKey(required(VARIABLE));
}

/** The stored value as a signing key, or a SigningKeyError saying what is wrong with it. */
export function loadPrivateKey(raw: string): crypto.KeyObject {
	const pem = normalisePem(raw);
	let key: crypto.KeyObject;
	try {
		key = crypto.createPrivateKey({ key: pem, format: 'pem' });
	} catch {
		throw new SigningKeyError(
			'it has a PRIVATE KEY block, but what is inside it is not a valid key; the copy may be incomplete'
		);
	}
	if (key.asymmetricKeyType !== 'ed25519') {
		throw new SigningKeyError(`its key type is ${key.asymmetricKeyType}, and licences are signed with Ed25519`);
	}
	return key;
}

/**
 * The PEM as it was stored, rebuilt into the form OpenSSL accepts.
 *
 * A key reaches Vercel's value box by copy and paste, and arrives in whatever
 * shape it was copied in. OpenSSL reports every shape but the canonical one as
 * `DECODER routines::unsupported`, naming nothing, and every activation fails.
 * So each unambiguous shape is rebuilt here:
 *
 * - The whole `.env` line, name included. Until 2026-09-29 the generator
 *   printed the key under the heading "Vercel environment variable" as
 *   `ED25519_PRIVATE_KEY="-----BEGIN…\n…"`, and following that label puts the
 *   name, the quotes and the escapes into the value.
 * - What a selection picks up around that line: the generator's `#` comments,
 *   blank lines, and neighbouring assignments such as `ED25519_KEY_ID=…`.
 * - Quotes: straight or curly, a pair or one left behind by a short selection.
 * - Line breaks escaped as `\n` (or `\\n` after a trip through JSON), turned
 *   into spaces by a browser field, or dropped.
 * - The base64 alone, without its BEGIN and END lines.
 *
 * Base64 has no quote, backslash, `#` or whitespace, so none of this can alter a
 * key that was stored correctly. What stays refused is anything ambiguous: two
 * private keys (signing with the first while ED25519_KEY_ID names the other
 * makes every site refuse the token), a public key, a bare 32-byte string (the
 * plugin's public key has that shape, and signing with it as a seed would mint
 * tokens no site accepts), or text beyond the key.
 */
export function normalisePem(raw: string): string {
	const kept: string[] = [];
	for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const trimmed = line.trim();
		// The generator's comment lines, and blank lines, copied along with the key.
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		/*
		 * `.env` lines. The key's own name is peeled off its value; a neighbouring
		 * line such as ED25519_KEY_ID=… is dropped. The name must contain an
		 * underscore, which standard base64 never does, so no line of the key
		 * itself can be mistaken for one.
		 */
		const assignment = /^(?:export\s+)?([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*)\s*=(.*)$/.exec(trimmed);
		if (!assignment) kept.push(trimmed);
		else if (assignment[1] === VARIABLE) kept.push(assignment[2].trim());
		else if (assignment[2].includes('PRIVATE KEY')) {
			// Dropping it would hide a second key, the case refused below for one name.
			throw new SigningKeyError('it holds a second private key under another variable name. Store one key alone');
		}
	}
	let value = kept.join('\n').replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();
	value = value.replace(/\\+r/g, '').replace(/\\+n/g, '\n').replace(/\r/g, '').trim();

	if (value === '') throw new SigningKeyError('it is empty');

	const begins = [...value.matchAll(/-----BEGIN ([A-Z0-9 ]{1,40})-----/g)].map((match) => match[1]);
	if (begins.length === 0) {
		if (!value.includes('-----END ')) return bareKey(value);
		throw new SigningKeyError('the copy was cut short: there is an END line but no -----BEGIN PRIVATE KEY----- line');
	}

	const foreign = begins.find((label) => label !== 'PRIVATE KEY' && label !== 'PUBLIC KEY');
	if (foreign) {
		const kind = KNOWN_LABELS.has(foreign) ? `a "${foreign}" block` : 'a PEM block of an unrecognised kind';
		throw new SigningKeyError(`it holds ${kind}, not the PKCS#8 "PRIVATE KEY" block the server signs with`);
	}
	const privates = begins.filter((label) => label === 'PRIVATE KEY').length;
	if (privates === 0 && begins.length > 0) {
		throw new SigningKeyError(
			'it holds a public key (BEGIN PUBLIC KEY). The public half goes into the plugin; this variable needs the private half'
		);
	}
	if (privates > 1) {
		throw new SigningKeyError(
			`it holds ${privates} private keys. Keep only the one whose public half the plugin lists under ED25519_KEY_ID`
		);
	}
	if (begins.length > 1) {
		throw new SigningKeyError('it holds a public key block as well as the private key. Store the private key alone');
	}

	const block = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(value);
	if (!block) {
		throw new SigningKeyError('the copy was cut short: there is no -----END PRIVATE KEY----- line after the BEGIN line');
	}
	if (value.slice(0, block.index).trim() !== '' || value.slice(block.index + block[0].length).trim() !== '') {
		throw new SigningKeyError(
			'it holds other text before or after the key block, such as another variable or more of the generator output'
		);
	}

	const body = block[1].replace(/\s+/g, '');
	if (body === '') throw new SigningKeyError('there is nothing between its BEGIN and END lines');
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
		throw new SigningKeyError(
			body.includes('\\')
				? 'the lines between BEGIN and END contain a backslash, so an escape sequence survived'
				: 'the lines between BEGIN and END contain characters that are not base64'
		);
	}
	assertOneKey(Buffer.from(body, 'base64'));
	return `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/** No PEM armour at all: accepted only when it is unmistakably a PKCS#8 Ed25519 key. */
function bareKey(value: string): string {
	const compact = value.replace(/\s+/g, '');
	// Shorter than a 32-byte key in base64 is not key material of any kind.
	if (compact.length < 43 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
		const lines = value.split('\n').length;
		throw new SigningKeyError(
			`it has no -----BEGIN PRIVATE KEY----- line (it is ${value.length} characters on ${lines} line${lines === 1 ? '' : 's'})`
		);
	}
	const der = Buffer.from(compact, 'base64');
	if (der.length === 32) {
		throw new SigningKeyError(
			"it is a bare 32-byte key, which is the shape of the plugin's public key, not of the private key"
		);
	}
	let key: crypto.KeyObject | undefined;
	try {
		key = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
	} catch {
		// Not PKCS#8 at all; refused below.
	}
	if (key?.asymmetricKeyType !== 'ed25519') {
		throw new SigningKeyError(
			`it has no -----BEGIN PRIVATE KEY----- line, and the ${der.length} bytes it decodes to are not a PKCS#8 Ed25519 key`
		);
	}
	assertOneKey(der);
	return key.export({ type: 'pkcs8', format: 'pem' }).toString();
}

/** The length a DER SEQUENCE declares for itself, header included, or null without such a header. */
function derExtent(der: Buffer): number | null {
	if (der.length < 2 || der[0] !== 0x30) return null;
	if (der[1] < 0x80) return 2 + der[1];
	const octets = der[1] & 0x7f;
	if (octets === 0 || octets > 3 || der.length < 2 + octets) return null;
	let length = 0;
	for (let i = 0; i < octets; i++) length = length * 256 + der[2 + i];
	return 2 + octets + length;
}

/**
 * Refuses bytes that run on past the key. OpenSSL parses the first structure
 * and ignores the rest, so a second key pasted onto the first would load as
 * the first while ED25519_KEY_ID names the second: ready, and refused by every
 * site. A value that is not a key at all is left for OpenSSL to refuse.
 */
function assertOneKey(der: Buffer): void {
	const extent = derExtent(der);
	if (extent !== null && extent < der.length) {
		throw new SigningKeyError('more data follows the key, as when a second key is pasted onto the first');
	}
}

/** What the server would sign with right now, or why it cannot sign. */
export type SigningStatus = { ready: true; kid: string; publicKey: string } | { ready: false; problem: string };

/**
 * Checked before a seat is claimed, and reported by the liveness probe.
 *
 * `publicKey` is base64 of the raw 32 bytes, the form the plugin's
 * `TokenVerifier::PUBLIC_KEYS` holds, so comparing the two is the whole proof
 * that server and plugin hold halves of one pair. Both values are public: the
 * key ships in every plugin zip and the kid in every token header.
 */
export function signingStatus(): SigningStatus {
	try {
		const kid = activeKeyId();
		const der = crypto.createPublicKey(privateKey()).export({ type: 'spki', format: 'der' });
		return { ready: true, kid, publicKey: Buffer.from(der.subarray(der.length - 32)).toString('base64') };
	} catch (error) {
		return { ready: false, problem: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Which key is signing right now.
 *
 * Required rather than defaulted. A default lets the server sign with a `kid`
 * that names a key the plugin does not hold, and the failure lands entirely on
 * the customer: every site refuses the entitlement with `unknown_key_id` while
 * the server looks healthy. Missing configuration should stop the server, not
 * the sites.
 *
 * The plugin looks the kid up by exact match, so the value gets the same
 * treatment as the key: the generator printed `ED25519_KEY_ID=stp-2026i` on the
 * line above the key, and a whole line pasted as the value would otherwise go
 * into every token header verbatim. Whatever is left must look like a kid.
 */
export function activeKeyId(): string {
	const raw = required('ED25519_KEY_ID');
	const kid = raw
		.trim()
		.replace(/^(?:export\s+)?ED25519_KEY_ID\s*=\s*/, '')
		.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
		.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(kid)) {
		throw new Error(
			`ED25519_KEY_ID is not a key id: it must be one short name such as stp-2026i, as \`npm run keys:generate\` prints it (it is ${raw.length} characters)`
		);
	}
	return kid;
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
