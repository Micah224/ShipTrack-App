import type { RequestHandler } from './$types';
import { audit, findLicenseByKey, refusal } from '$lib/server/domain/licenses';
import { countSeats, releaseSeat } from '$lib/server/domain/seats';
import { fail, ok, readJson } from '$lib/server/http';
import { InvalidField, str } from '$lib/server/validate';

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let installId: string;
	try {
		key = str(body, 'key', { max: 128 });
		installId = str(body, 'install_id', { max: 128 });
	} catch (error) {
		if (error instanceof InvalidField) return fail(refusal('invalid_request', error.message, 400));
		throw error;
	}

	const license = await findLicenseByKey(key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	// Deactivating something already gone is a success, not a fault: the plugin
	// retries this on uninstall and must not be left stuck.
	const released = await releaseSeat(license.id, installId);
	if (released) {
		await audit('license.deactivated', released.domain, license.id, { install_id: installId });
	}

	const used = await countSeats(license.id);
	return ok({ released: Boolean(released), seats: { used, total: license.maxSeats } });
};
