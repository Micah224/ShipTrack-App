import crypto from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	loadPrivateKey,
	normalisePem,
	rawPublicKeyBase64,
	signingStatus,
	SigningKeyError,
	signLicenseToken,
	verifyLicenseToken,
	type LicenseTokenPayload
} from './ed25519.ts';

let publicPem: string;
let privatePem: string;

beforeAll(() => {
	const pair = crypto.generateKeyPairSync('ed25519');
	privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
	process.env.ED25519_PRIVATE_KEY = privatePem;
	process.env.ED25519_KEY_ID = 'stp-test';
	publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

function payload(overrides: Partial<LicenseTokenPayload> = {}): LicenseTokenPayload {
	const iat = Math.floor(Date.now() / 1000);
	return {
		v: 1,
		sub: 'sha256:abc123',
		domain: 'logistics.example.com',
		install: 'a3f1c8de-0000-4000-8000-000000000001',
		tier: 'PROFESSIONAL',
		features: ['truck', 'plane', 'train'],
		status: 'ACTIVE',
		seats: { used: 1, total: 3 },
		limits: { branches: 5, auditRetentionDays: 90 },
		exp: iat + 604_800,
		iat,
		nbf: iat - 60,
		nonce: 'test-nonce',
		...overrides
	};
}

describe('signLicenseToken', () => {
	it('produces a three-part token that verifies', () => {
		const signed = signLicenseToken(payload());
		expect(signed.token.split('.')).toHaveLength(3);
		expect(verifyLicenseToken(signed.token, publicPem)).toMatchObject({ tier: 'PROFESSIONAL' });
	});

	it('returns the exact signed payload bytes, not a re-encode', () => {
		const claims = payload();
		const signed = signLicenseToken(claims);
		// This is the contract the PHP client depends on: it must verify these
		// bytes, because json_encode(json_decode($x)) will not reproduce them.
		expect(signed.payload).toBe(signed.token.split('.')[1]);
		expect(JSON.parse(Buffer.from(signed.payload, 'base64url').toString())).toEqual(claims);
	});

	it('carries the key id in the header, so rotation is possible', () => {
		const signed = signLicenseToken(payload());
		const header = JSON.parse(Buffer.from(signed.token.split('.')[0], 'base64url').toString());
		expect(header).toMatchObject({ alg: 'Ed25519', typ: 'STP-LIC', kid: 'stp-test' });
		expect(signed.kid).toBe('stp-test');
	});

	it('binds to both domain and install, so a token cannot be copied sideways', () => {
		const a = signLicenseToken(payload({ install: 'install-a' }));
		const b = signLicenseToken(payload({ install: 'install-b' }));
		expect(a.token).not.toBe(b.token);
	});

	it('never puts the licence key itself in the token', () => {
		const signed = signLicenseToken(payload());
		const decoded = Buffer.from(signed.payload, 'base64url').toString();
		expect(decoded).toContain('sha256:');
		expect(decoded).not.toMatch(/STP-[0-9A-Z]{4}-/);
	});
});

describe('verifyLicenseToken', () => {
	it('rejects a tampered payload', () => {
		const signed = signLicenseToken(payload({ tier: 'STARTER' }));
		const [header, , signature] = signed.token.split('.');
		const forged = Buffer.from(JSON.stringify(payload({ tier: 'ENTERPRISE' }))).toString('base64url');
		expect(verifyLicenseToken(`${header}.${forged}.${signature}`, publicPem)).toBeNull();
	});

	it('rejects a token signed by a different key', () => {
		const other = crypto.generateKeyPairSync('ed25519');
		const signed = signLicenseToken(payload());
		const otherPem = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
		expect(verifyLicenseToken(signed.token, otherPem)).toBeNull();
	});

	it('rejects a malformed token', () => {
		expect(verifyLicenseToken('not.a.valid.token', publicPem)).toBeNull();
		expect(verifyLicenseToken('nonsense', publicPem)).toBeNull();
	});
});

describe('rawPublicKeyBase64', () => {
	it('returns the 32 raw bytes sodium expects in PHP', () => {
		const raw = rawPublicKeyBase64(publicPem);
		expect(Buffer.from(raw, 'base64')).toHaveLength(32);
	});

	it('matches the tail of the SPKI export', () => {
		const der = crypto.createPublicKey(publicPem).export({ type: 'spki', format: 'der' });
		expect(Buffer.from(rawPublicKeyBase64(publicPem), 'base64')).toEqual(
			Buffer.from(der.subarray(der.length - 32))
		);
	});
});

describe('normalisePem', () => {
	const escaped = (pem: string) => pem.trimEnd().replace(/\n/g, '\\n');
	const body = (pem: string) => pem.split('\n').slice(1, -2).join('');

	/*
	 * The shapes a PEM takes on its way into a dashboard field. Each one fails in
	 * createPrivateKey with the same "DECODER routines::unsupported", which is
	 * how production activation broke with nothing in the log naming the cause.
	 */
	const mangled: [string, (pem: string) => string][] = [
		['the .env value pasted verbatim', (pem) => `"${escaped(pem)}"`],
		['escaped newlines without the quotes', (pem) => escaped(pem)],
		['single-quoted', (pem) => `'${pem}'`],
		['line breaks turned into spaces', (pem) => pem.replace(/\n/g, ' ')],
		['line breaks removed', (pem) => pem.replace(/\n/g, '')],
		['Windows line endings', (pem) => pem.replace(/\n/g, '\r\n')],
		['surrounding whitespace', (pem) => `\n  ${pem}\n\n`],
		/*
		 * What production held from 2026-09-04: the generator printed the key under
		 * "# Vercel environment variable" as this whole line, name and all, and
		 * every activation and heartbeat failed on it from 2026-09-24.
		 */
		['the whole .env line, name and all', (pem) => `ED25519_PRIVATE_KEY="${escaped(pem)}"`],
		[
			'that line under its generator heading',
			(pem) => `# Vercel environment variable (keep secret)\nED25519_PRIVATE_KEY="${escaped(pem)}"\n`
		],
		[
			'that line with the key id above it',
			(pem) => `# Key id\nED25519_KEY_ID=stp-2026i\n\n# Vercel environment variable (keep secret)\nED25519_PRIVATE_KEY="${escaped(pem)}"`
		],
		['an exported shell assignment', (pem) => `export ED25519_PRIVATE_KEY='${pem.trimEnd()}'`],
		['a multi-line dotenv value', (pem) => `ED25519_PRIVATE_KEY="${pem.trimEnd()}"`],
		[
			'the Vercel block under its generator comments',
			(pem) => `# Private key for Vercel (keep secret). Vercel stores values verbatim and\n# unescapes nothing, so paste THIS form.\n${pem}`
		],
		['curly quotes from a rich-text copy', (pem) => `“${pem.trimEnd()}”`],
		['a closing quote lost to a short selection', (pem) => `"${escaped(pem)}`],
		['escapes doubled by a trip through JSON', (pem) => pem.trimEnd().replace(/\n/g, '\\\\n')],
		['a byte-order mark', (pem) => `\uFEFF${pem}`],
		['the base64 alone, without BEGIN and END', (pem) => body(pem)]
	];

	it.each(mangled)('recovers %s', (_name, mangle) => {
		expect(normalisePem(mangle(privatePem))).toBe(privatePem);
	});

	it.each(mangled)('signs a verifiable token from %s', (_name, mangle) => {
		const original = process.env.ED25519_PRIVATE_KEY;
		process.env.ED25519_PRIVATE_KEY = mangle(privatePem);
		try {
			const signed = signLicenseToken(payload());
			expect(verifyLicenseToken(signed.token, publicPem)).toMatchObject({ tier: 'PROFESSIONAL' });
		} finally {
			process.env.ED25519_PRIVATE_KEY = original;
		}
	});

	it('leaves a correctly stored key exactly as it was', () => {
		expect(normalisePem(privatePem)).toBe(privatePem);
	});

	function refusalOf(value: string): string {
		let error: unknown;
		try {
			loadPrivateKey(value);
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(SigningKeyError);
		return (error as Error).message;
	}

	/** Refused with a message naming the problem, and no run of the value, or of the key, in it. */
	function expectRefusal(value: string, reason: RegExp) {
		const message = refusalOf(value);
		expect(message).toMatch(reason);
		const runs = [...value.matchAll(/[A-Za-z0-9+/]{12,}/g)].map((match) => match[0]);
		for (const run of [...runs, body(privatePem)]) {
			for (let at = 0; at + 12 <= run.length; at += 4) {
				expect(message).not.toContain(run.slice(at, at + 12));
			}
		}
	}

	const other = () =>
		crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

	it('refuses an empty value, or one that is only comments', () => {
		expectRefusal('', /it is empty/);
		expectRefusal('# Vercel environment variable (keep secret)\n', /it is empty/);
		expectRefusal('ED25519_PRIVATE_KEY=""', /it is empty/);
	});

	it('refuses a public key, in either form, rather than signing with it', () => {
		expectRefusal(publicPem, /holds a public key \(BEGIN PUBLIC KEY\)/);
		// The plugin's constant: 32 raw bytes. Taken as a seed it would sign tokens no site accepts.
		expectRefusal(rawPublicKeyBase64(publicPem), /bare 32-byte key/);
	});

	it('refuses two keys pasted together rather than signing with the first', () => {
		expectRefusal(privatePem + other(), /holds 2 private keys/);
		expectRefusal(`${privatePem}\n${publicPem}`, /public key block as well as the private key/);
	});

	it('refuses a key in a container other than PKCS#8', () => {
		const openssh = `-----BEGIN OPENSSH PRIVATE KEY-----\n${body(privatePem)}\n-----END OPENSSH PRIVATE KEY-----\n`;
		expectRefusal(openssh, /"OPENSSH PRIVATE KEY" block/);
	});

	it('names a block only by a known label, since any other label came from the value', () => {
		const odd = `-----BEGIN SHIPTRACK SECRET-----\n${body(privatePem)}\n-----END SHIPTRACK SECRET-----\n`;
		expectRefusal(odd, /a PEM block of an unrecognised kind/);
		expect(refusalOf(odd)).not.toContain('SHIPTRACK');
	});

	/*
	 * OpenSSL parses the first key and ignores what follows, so a second key
	 * pasted onto the first loaded as the first while ED25519_KEY_ID named the
	 * second: ready, and refused by every site.
	 */
	it('refuses a second key run onto the first, bare or armoured', () => {
		const first = body(privatePem);
		const second = body(other());
		expectRefusal(first + second, /more data follows the key/);
		expectRefusal(`-----BEGIN PRIVATE KEY-----\n${first}\n${second}\n-----END PRIVATE KEY-----\n`, /more data follows the key/);
		const trailing = Buffer.concat([Buffer.from(first, 'base64'), Buffer.from('trailing')]).toString('base64');
		expectRefusal(trailing, /more data follows the key/);
	});

	it('refuses a second key stored under another name, rather than dropping it', () => {
		const next = `ED25519_PRIVATE_KEY_NEXT="${escaped(other())}"`;
		expectRefusal(`${next}\nED25519_PRIVATE_KEY="${escaped(privatePem)}"`, /second private key under another variable name/);
	});

	it('refuses a copy cut short, or with text around the key', () => {
		expectRefusal(privatePem.split('-----END')[0], /no -----END PRIVATE KEY----- line after the BEGIN line/);
		expectRefusal(privatePem.split('\n').slice(1).join('\n'), /an END line but no -----BEGIN PRIVATE KEY----- line/);
		expectRefusal('-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----\n', /nothing between its BEGIN and END lines/);
		expectRefusal(`${privatePem}trailing`, /other text before or after the key block/);
		expectRefusal(`KEY=${privatePem}`, /other text before or after the key block/);
		expectRefusal(`${privatePem}    'stp-2026i' => 'abc=',\n`, /other text before or after the key block/);
	});

	it('refuses a body that is not base64, and says when an escape survived', () => {
		const lines = privatePem.split('\n');
		expectRefusal([lines[0], `${lines[1]}\\t`, ...lines.slice(2)].join('\n'), /backslash/);
		expectRefusal([lines[0], `${lines[1]}*`, ...lines.slice(2)].join('\n'), /not base64/);
	});

	it('refuses armour-less text that is not a key, giving only its size', () => {
		expectRefusal('not a key at all', /no -----BEGIN PRIVATE KEY----- line \(it is 16 characters on 1 line\)/);
		expectRefusal(crypto.randomBytes(48).toString('base64'), /the 48 bytes it decodes to are not a PKCS#8 Ed25519 key/);
	});

	it('refuses a valid PEM that holds a damaged key or another algorithm', () => {
		const damaged = privatePem.replace(/MC4CAQAwBQYDK2Vw/, 'MC4CAQAwBQYDK2Vx');
		expectRefusal(damaged, /not a valid key/);
		const ec = crypto
			.generateKeyPairSync('ec', { namedCurve: 'P-256' })
			.privateKey.export({ type: 'pkcs8', format: 'pem' })
			.toString();
		expectRefusal(ec, /its key type is ec, and licences are signed with Ed25519/);
	});
});

describe('signingStatus', () => {
	function withEnv(env: Record<string, string | undefined>, run: () => void) {
		const saved = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
		for (const [name, value] of Object.entries(env)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		try {
			run();
		} finally {
			for (const [name, value] of Object.entries(saved)) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	}

	it('names the signing key in the form the plugin lists it', () => {
		expect(signingStatus()).toEqual({ ready: true, kid: 'stp-test', publicKey: rawPublicKeyBase64(publicPem) });
	});

	it('reports a key it cannot load, with the reason', () => {
		withEnv({ ED25519_PRIVATE_KEY: publicPem }, () => {
			expect(signingStatus()).toEqual({ ready: false, problem: expect.stringMatching(/holds a public key/) });
		});
	});

	it.each([
		['the whole .env line', 'ED25519_KEY_ID=stp-test'],
		['an exported, quoted assignment', 'export ED25519_KEY_ID="stp-test"'],
		['quotes', '"stp-test"'],
		['a trailing line break', 'stp-test\n']
	])('reads the key id from %s, and signs under the bare kid', (_name, value) => {
		withEnv({ ED25519_KEY_ID: value }, () => {
			expect(signingStatus()).toMatchObject({ ready: true, kid: 'stp-test' });
			const header = JSON.parse(Buffer.from(signLicenseToken(payload()).token.split('.')[0], 'base64url').toString());
			expect(header.kid).toBe('stp-test');
		});
	});

	it('refuses a key id that is not one, whose tokens every site would refuse', () => {
		for (const value of ['stp 2026i', 'ED25519_KEY_ID=stp-2026i\nED25519_PRIVATE_KEY=x', 'k'.repeat(65), privatePem]) {
			withEnv({ ED25519_KEY_ID: value }, () => {
				const status = signingStatus();
				expect(status).toEqual({ ready: false, problem: expect.stringMatching(/ED25519_KEY_ID is not a key id/) });
				expect(JSON.stringify(status)).not.toContain(privatePem.split('\n')[1].slice(0, 16));
			});
		}
	});

	it('reports a missing key id, which would sign tokens every site refuses', () => {
		withEnv({ ED25519_KEY_ID: undefined }, () => {
			expect(signingStatus()).toEqual({ ready: false, problem: expect.stringMatching(/ED25519_KEY_ID/) });
		});
	});
});
