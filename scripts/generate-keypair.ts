/**
 * Generates the Ed25519 signing keypair, offline.
 *
 * Run this on a machine you trust, once. The private key goes into Vercel as an
 * environment variable and nowhere else; the base64 public key is pasted into
 * the plugin as a constant. It is never fetched over the network — a plugin
 * that downloads the key it verifies against is verifying nothing.
 *
 *   npm run keys:generate
 */
import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const der = publicKey.export({ type: 'spki', format: 'der' });
const rawBase64 = Buffer.from(der.subarray(der.length - 32)).toString('base64');

// Prove the pair round-trips before anyone installs it.
const probe = Buffer.from('shiptrack-pro-keypair-probe');
if (!crypto.verify(null, probe, publicKey, crypto.sign(null, probe, privateKey))) {
	throw new Error('Generated keypair failed its own verification. Do not use it.');
}

const kid = `stp-${new Date().getUTCFullYear()}${String.fromCharCode(97 + new Date().getUTCMonth() % 26)}`;

console.log(`# Key id\nED25519_KEY_ID=${kid}\n`);
console.log(`# Vercel environment variable (keep secret)\nED25519_PRIVATE_KEY="${privatePem.trimEnd().replace(/\n/g, '\\n')}"\n`);
console.log(`# Paste into LicenseService::PUBLIC_KEY_BASE64 in the plugin\n${rawBase64}\n`);
console.log(`# Public key, PEM (for reference)\n${publicPem}`);
console.log(`# Licence key ciphering secret\nLICENSE_KEY_SECRET=${crypto.randomBytes(32).toString('base64')}`);
console.log(`# GitHub webhook secret\nGITHUB_WEBHOOK_SECRET=${crypto.randomBytes(32).toString('hex')}`);
