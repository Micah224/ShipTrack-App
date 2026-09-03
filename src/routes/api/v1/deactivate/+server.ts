import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations } from '$lib/server/db/schema';
import { audit, countSeats, findLicenseByKey, refusal } from '$lib/server/domain/licenses';
import { fail, ok, readJson } from '$lib/server/http';

interface DeactivateBody {
	key?: string;
	install_id?: string;
}

/**
 * Releases a seat.
 *
 * The row is kept and stamped rather than deleted: the abuse queue and the
 * support screens both need to see that a site was here and left, and a delete
 * throws that away for no gain.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<DeactivateBody>(request);
	if (!body?.key || !body.install_id) {
		return fail(refusal('invalid_request', 'key and install_id are required.', 400));
	}

	const license = await findLicenseByKey(body.key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const db = getDb();
	const rows = await db
		.select()
		.from(activations)
		.where(and(eq(activations.licenseId, license.id), eq(activations.installId, body.install_id)))
		.limit(1);

	const activation = rows[0];
	// Deactivating something that is already gone is a success, not a fault:
	// the plugin retries this on uninstall and must not be left stuck.
	if (activation && !activation.releasedAt) {
		await db
			.update(activations)
			.set({ releasedAt: new Date(), releaseReason: 'SELF_SERVICE' })
			.where(eq(activations.id, activation.id));

		await audit('license.deactivated', activation.domain, license.id, {
			install_id: body.install_id
		});
	}

	const used = await countSeats(license.id);
	return ok({ released: Boolean(activation), seats: { used, total: license.maxSeats } });
};
