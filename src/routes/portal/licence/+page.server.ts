import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { activations, licenses } from '$lib/server/db/schema';
import { audit, licenseState, reclaimAfterDays } from '$lib/server/domain/licenses';
import { effectiveFeatures, effectiveLimits } from '$lib/server/domain/tiers';
import { countSeats, releaseSeat } from '$lib/server/domain/seats';

/*
 * Everything here is scoped by `locals.portal.licenseId`, which comes from the
 * signed session cookie and never from the request.
 *
 * That is the whole security model of this page: there is no licence id in a
 * URL or a form field to tamper with, so there is no object-reference to get
 * wrong. A customer cannot ask for another customer's data because they have no
 * way to name it.
 */

async function licenceFor(licenseId: string) {
	const rows = await getDb().select().from(licenses).where(eq(licenses.id, licenseId)).limit(1);
	return rows[0];
}

export const load: PageServerLoad = async ({ locals }) => {
	const licenseId = locals.portal!.licenseId;
	const license = await licenceFor(licenseId);

	// The session outlived the licence row. Treat it as signed out rather than
	// crashing: a deleted licence is a support conversation, not a 500.
	if (!license) return { missing: true as const };

	const installs = await getDb()
		.select({
			id: activations.id,
			domain: activations.domain,
			environment: activations.environment,
			countsSeat: activations.countsSeat,
			pluginVersion: activations.pluginVersion,
			wpVersion: activations.wpVersion,
			lastHeartbeat: activations.lastHeartbeat,
			createdAt: activations.createdAt,
			releasedAt: activations.releasedAt,
			releaseReason: activations.releaseReason
		})
		.from(activations)
		.where(eq(activations.licenseId, licenseId))
		.orderBy(desc(activations.lastHeartbeat))
		.limit(200);

	return {
		missing: false as const,
		licence: {
			// The key itself is never sent to the browser — only the prefix, which is
			// what support asks for and what the customer can recognise.
			keyPrefix: license.keyPrefix,
			tier: license.tier,
			status: license.status,
			state: licenseState(license),
			maxSeats: license.maxSeats,
			seatsUsed: await countSeats(license.id),
			expiresAt: license.expiresAt,
			gracePeriodDays: license.gracePeriodDays,
			features: effectiveFeatures(license),
			limits: effectiveLimits(license)
		},
		installs,
		reclaimAfterDays: reclaimAfterDays()
	};
};

export const actions: Actions = {
	/** Frees a seat the customer no longer needs, without contacting support. */
	release: async ({ request, locals }) => {
		const licenseId = locals.portal!.licenseId;
		const form = await request.formData();
		const activationId = String(form.get('activation_id') ?? '');

		if (!activationId) return fail(400, { message: 'No install selected.' });

		/*
		 * Ownership is re-checked here rather than trusted from the list that was
		 * rendered. The id arrives in a form field, so it is caller-supplied: the
		 * previous load proves nothing about THIS request.
		 */
		const rows = await getDb()
			.select({ id: activations.id, domain: activations.domain, installId: activations.installId })
			.from(activations)
			.where(and(eq(activations.id, activationId), eq(activations.licenseId, licenseId)))
			.limit(1);

		const owned = rows[0];
		if (!owned) return fail(404, { message: 'That install is not on your licence.' });

		await releaseSeat(licenseId, owned.installId, 'SELF_SERVICE');
		await audit('portal.seat_released', owned.domain, licenseId, {
			install_id: owned.installId,
			via: 'portal'
		});

		return { released: owned.domain };
	}
};
