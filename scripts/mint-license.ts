/**
 * Mints a licence by hand — the working sales channel until payments land.
 *
 * Runs on Node against the direct (unpooled) connection. It imports the same
 * key and cipher code the server uses rather than restating it: two
 * implementations of one AES-GCM envelope drift, and the drift shows up as
 * licences the server cannot decrypt.
 *
 *   npm run license:mint -- --email a@b.com --name "A B" --tier PROFESSIONAL
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { userInfo } from 'node:os';
import {
	encryptLicenseKey,
	generateLicenseKey,
	hashLicenseKey,
	licenseKeyPrefix
} from '../src/lib/server/crypto/keys.ts';
import { DEFAULT_SEATS, type Tier } from '../src/lib/server/domain/tiers.ts';
import * as schema from '../src/lib/server/db/schema.ts';

function arg(name: string, fallback?: string): string {
	const index = process.argv.indexOf(`--${name}`);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (value === undefined) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Missing --${name}`);
	}
	return value;
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL.');
if (!process.env.LICENSE_KEY_SECRET) throw new Error('Set LICENSE_KEY_SECRET.');

const db = drizzle(neon(url), { schema });

const email = arg('email').trim().toLowerCase();
const name = arg('name');
const tier = arg('tier', 'STARTER').toUpperCase() as Tier;
if (!(tier in DEFAULT_SEATS)) {
	throw new Error(`Unknown tier "${tier}". Use STARTER, PROFESSIONAL or ENTERPRISE.`);
}
const seats = Number(arg('seats', String(DEFAULT_SEATS[tier])));
const expires = arg('expires', '');

// Reuse the customer if this email already bought something. Normalisation is
// trim plus lowercase and nothing else: people use +tags and dots deliberately,
// and silently merging two real customers is worse than the duplicate it avoids.
const existing = await db
	.select()
	.from(schema.customers)
	.where(eq(schema.customers.email, email))
	.limit(1);

const customer =
	existing[0] ?? (await db.insert(schema.customers).values({ email, name }).returning())[0];

const key = generateLicenseKey();

const [license] = await db
	.insert(schema.licenses)
	.values({
		keyHash: hashLicenseKey(key),
		keyCipher: encryptLicenseKey(key),
		keyPrefix: licenseKeyPrefix(key),
		customerId: customer.id,
		tier,
		maxSeats: seats,
		expiresAt: expires ? new Date(expires) : null
	})
	.returning();

await db.insert(schema.auditLogs).values({
	licenseId: license.id,
	action: 'license.mint',
	actor: `cli:${userInfo().username}`,
	details: { email, tier, seats, expires: expires || 'lifetime' }
});

console.log(`\nLicence minted for ${email}`);
console.log(`  tier    ${tier}`);
console.log(`  seats   ${seats}`);
console.log(`  expires ${expires || 'never'}`);
console.log(`  key     ${key}\n`);
console.log('This is the only time the key appears in plaintext. Send it to the customer now.\n');
