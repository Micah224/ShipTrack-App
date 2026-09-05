import { eq } from 'drizzle-orm';
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { customers, licenses } from '$lib/server/db/schema';
import { listLicenses } from '$lib/server/admin/queries';
import { auditAdmin } from '$lib/server/admin/session';
import {
	decryptLicenseKey,
	encryptLicenseKey,
	generateLicenseKey,
	hashLicenseKey,
	licenseKeyPrefix
} from '$lib/server/crypto/keys';
import { DEFAULT_SEATS, type Tier } from '$lib/server/domain/tiers';

const TIERS: Tier[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	return { licenses: await listLicenses(search), search, tiers: TIERS };
};

function actor(locals: App.Locals): string {
	return locals.admin?.email ?? 'unknown-admin';
}

export const actions: Actions = {
	mint: async ({ request, locals }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const name = String(form.get('name') ?? '').trim();
		const tier = String(form.get('tier') ?? 'STARTER').toUpperCase() as Tier;
		const expires = String(form.get('expires') ?? '').trim();
		const label = String(form.get('label') ?? '').trim();

		if (!email || !name) return fail(400, { message: 'Customer email and name are required.' });
		if (!TIERS.includes(tier)) return fail(400, { message: `Unknown tier ${tier}.` });

		const seatsRaw = String(form.get('seats') ?? '').trim();
		const seats = seatsRaw ? Number(seatsRaw) : DEFAULT_SEATS[tier];
		if (!Number.isInteger(seats) || seats < 1) {
			return fail(400, { message: 'Seats must be a whole number of at least 1.' });
		}

		const db = getDb();
		// Reuse the customer when the email is already known. Normalisation is
		// trim plus lowercase only: people use +tags deliberately, and merging
		// two real customers is worse than the duplicate it would prevent.
		const existing = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
		const customer =
			existing[0] ?? (await db.insert(customers).values({ email, name }).returning())[0];

		const key = generateLicenseKey();
		const [license] = await db
			.insert(licenses)
			.values({
				keyHash: hashLicenseKey(key),
				keyCipher: encryptLicenseKey(key),
				keyPrefix: licenseKeyPrefix(key),
				customerId: customer.id,
				tier,
				maxSeats: seats,
				label: label || null,
				expiresAt: expires ? new Date(expires) : null
			})
			.returning();

		await auditAdmin('admin.license_minted', actor(locals), license.id, {
			email,
			tier,
			seats,
			expires: expires || 'lifetime'
		});

		// Returned once and never again: the plaintext key exists nowhere else.
		return { minted: { key, email, tier, seats } };
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const tier = String(form.get('tier') ?? '').toUpperCase() as Tier;
		const seats = Number(form.get('seats'));
		const expires = String(form.get('expires') ?? '').trim();
		const label = String(form.get('label') ?? '').trim();

		if (!id) return fail(400, { message: 'Missing licence id.' });
		if (!TIERS.includes(tier)) return fail(400, { message: `Unknown tier ${tier}.` });
		if (!Number.isInteger(seats) || seats < 1) {
			return fail(400, { message: 'Seats must be a whole number of at least 1.' });
		}

		const db = getDb();
		await db
			.update(licenses)
			.set({
				tier,
				maxSeats: seats,
				label: label || null,
				expiresAt: expires ? new Date(expires) : null,
				updatedAt: new Date()
			})
			.where(eq(licenses.id, id));

		await auditAdmin('admin.license_updated', actor(locals), id, {
			tier,
			seats,
			expires: expires || 'lifetime'
		});
		return { message: 'Licence updated.' };
	},

	status: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '').toUpperCase();

		if (!['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) {
			return fail(400, { message: `Unknown status ${status}.` });
		}

		const db = getDb();
		await db
			.update(licenses)
			.set({ status: status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED', updatedAt: new Date() })
			.where(eq(licenses.id, id));

		/*
		 * Activations are deliberately left alone. Revocation is expressed in the
		 * next signed entitlement -- which every install fetches on heartbeat --
		 * so releasing the seats here would only lose the record of who was using
		 * the licence, without taking anything away any sooner.
		 */
		await auditAdmin(`admin.license_${status.toLowerCase()}`, actor(locals), id, {});
		return { message: `Licence set to ${status}.` };
	},

	reveal: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');

		const db = getDb();
		const rows = await db.select().from(licenses).where(eq(licenses.id, id)).limit(1);
		if (!rows[0]) return fail(404, { message: 'No such licence.' });

		let key: string;
		try {
			key = decryptLicenseKey(rows[0].keyCipher);
		} catch {
			return fail(500, { message: 'Could not decrypt this key. Check LICENSE_KEY_SECRET.' });
		}

		// Every reveal is audited, whoever does it. A key that can be read
		// without a trace is a key nobody can account for later.
		await auditAdmin('admin.key_revealed', actor(locals), id, { prefix: rows[0].keyPrefix });
		return { revealed: { id, key } };
	}
};
