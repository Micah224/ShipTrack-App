import type { RequestHandler } from './$types';
import { audit, findLicenseByKey, refusal } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { countSeats, releaseSeat } from '$lib/server/domain/seats';
import { fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
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
		/*
		 * Metered only after the lookup failed. A per-key bucket here would hand an
		 * enumerator a fresh budget per guess, so the miss path gets the one global
		 * bucket instead — safe because no resolved licence ever reaches it.
		 */
		const missLimit = await meterMiss();
		if (missLimit.limited) return limited(missLimit, 'Too many requests. Try again in a moment.');
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const rate = await meterLicense('deactivate', license, installId);
	if (rate.limited) {
		return limited(
			rate,
			'This licence is sending requests faster than expected. It will resume automatically.'
		);
	}

	// Deactivating something already gone is a success, not a fault: the plugin
	// retries this on uninstall and must not be left stuck.
	const released = await releaseSeat(license.id, installId);
	if (released) {
		await audit('license.deactivated', released.domain, license.id, { install_id: installId });
	}

	const used = await countSeats(license.id);
	return ok({ released: Boolean(released), seats: { used, total: license.maxSeats } }, 200, rateLimitHeaders(rate));
};
