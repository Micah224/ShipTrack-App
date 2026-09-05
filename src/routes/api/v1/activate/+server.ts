import type { RequestHandler } from './$types';
import { buildEntitlement } from '$lib/server/domain/entitlement';
import { audit, findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { claimSeat } from '$lib/server/domain/seats';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { classifySite } from '$lib/server/domain/site';
import { clientIp, fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { InvalidField, optionalStr, optionalStrArray, str } from '$lib/server/validate';

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let siteUrl: string;
	let installId: string;
	let pluginVersion: string;
	let telemetry;
	let nonce: string | null;
	try {
		key = str(body, 'key', { max: 128 });
		siteUrl = str(body, 'site_url');
		installId = str(body, 'install_id', { max: 128 });
		pluginVersion = str(body, 'plugin_version', { max: 32 });
		nonce = optionalStr(body, 'nonce', { max: 128 });
		telemetry = {
			siteUrl,
			ipAddress: clientIp(request),
			pluginVersion,
			wpVersion: optionalStr(body, 'wp_version', { max: 32 }),
			phpVersion: optionalStr(body, 'php_version', { max: 32 }),
			activeMapProvider: optionalStr(body, 'map_provider', { max: 32 }),
			transportModesUsed: optionalStrArray(body, 'transport_modes')
		};
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

	const rate = await meterLicense('activate', license, installId);
	if (rate.limited) {
		return limited(
			rate,
			'This licence is sending requests faster than expected. It will resume automatically.'
		);
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);
	if (denied) {
		await audit('license.activate_denied', siteUrl, license.id, { reason: denied.code });
		return fail(denied);
	}

	const site = classifySite(siteUrl);
	if (!site.domain) {
		return fail(refusal('invalid_request', 'site_url did not contain a usable host.', 400));
	}

	const outcome = await claimSeat(license, installId, site, telemetry);

	if (!outcome.ok) {
		await audit('license.seat_limit', site.domain, license.id, {
			used: outcome.used,
			max: license.maxSeats,
			install_id: installId
		});
		return fail(
			refusal(
				'seat_limit_reached',
				`This licence covers ${license.maxSeats} production site(s) and all are in use. Deactivate one, or upgrade the licence.`
			)
		);
	}

	const entitlement = buildEntitlement(
		license,
		{ domain: site.domain, installId },
		state,
		{ used: outcome.used, total: license.maxSeats },
		nonce ?? undefined
	);

	await audit('license.activated', site.domain, license.id, {
		install_id: installId,
		environment: site.environment,
		counts_seat: site.countsSeat
	});

	return ok({
		token: entitlement.token,
		payload: entitlement.payload,
		kid: entitlement.kid,
		expires_at: entitlement.expiresAt,
		state,
		environment: site.environment,
		counts_seat: site.countsSeat,
		seats: { used: outcome.used, total: license.maxSeats }
	}, 200, rateLimitHeaders(rate));
};
