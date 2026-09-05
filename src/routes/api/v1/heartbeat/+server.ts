import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations } from '$lib/server/db/schema';
import { buildEntitlement } from '$lib/server/domain/entitlement';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { countSeats, findActivation } from '$lib/server/domain/seats';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { classifySite } from '$lib/server/domain/site';
import { clientIp, fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { latestRelease } from '$lib/server/domain/releases';
import { InvalidField, optionalStr, optionalStrArray, str } from '$lib/server/validate';

/**
 * The plugin's periodic check-in. Re-signs a fresh entitlement, refreshes
 * telemetry, and reports the newest release so the update check needs no
 * second round trip.
 *
 * Note what this deliberately does NOT update: `domain`, `environment` and
 * `counts_seat`. Those are decided at activation, where the seat cap is
 * enforced. Letting a heartbeat rewrite them from an unauthenticated
 * `site_url` meant any install could relabel itself as staging, drop off the
 * seat ledger, and carry on holding a valid entitlement -- unlimited
 * production sites on a one-seat licence. A site that genuinely moves
 * re-activates, and re-activation re-checks the cap.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let siteUrl: string;
	let installId: string;
	let nonce: string | null;
	let reported;
	try {
		key = str(body, 'key', { max: 128 });
		siteUrl = str(body, 'site_url');
		installId = str(body, 'install_id', { max: 128 });
		nonce = optionalStr(body, 'nonce', { max: 128 });
		reported = {
			pluginVersion: optionalStr(body, 'plugin_version', { max: 32 }),
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

	const rate = await meterLicense('heartbeat', license, installId);
	if (rate.limited) {
		return limited(
			rate,
			'This licence is sending requests faster than expected. It will resume automatically.'
		);
	}

	const activation = await findActivation(license.id, installId);
	if (!activation || activation.releasedAt) {
		return fail(
			refusal('invalid_request', 'This install is not activated. Call /api/v1/activate first.', 409)
		);
	}

	const site = classifySite(siteUrl);
	if (site.domain !== activation.domain) {
		// Not a failure the plugin should retry on: the seat was granted against
		// the recorded domain, and moving is an activation decision.
		return fail(
			refusal(
				'domain_changed',
				'This install is registered to a different domain. Call /api/v1/activate to move it.',
				409
			)
		);
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);

	const db = getDb();
	await db
		.update(activations)
		.set({
			siteUrl,
			ipAddress: clientIp(request),
			pluginVersion: reported.pluginVersion ?? activation.pluginVersion,
			wpVersion: reported.wpVersion ?? activation.wpVersion,
			phpVersion: reported.phpVersion ?? activation.phpVersion,
			activeMapProvider: reported.activeMapProvider ?? activation.activeMapProvider,
			transportModesUsed: reported.transportModesUsed.length
				? reported.transportModesUsed
				: activation.transportModesUsed,
			lastHeartbeat: new Date()
		})
		.where(eq(activations.id, activation.id));

	const used = await countSeats(license.id);
	const entitlement = buildEntitlement(
		license,
		{ domain: activation.domain, installId },
		state,
		{ used, total: license.maxSeats },
		nonce ?? undefined
	);

	const release = await latestRelease();

	return ok({
		token: entitlement.token,
		payload: entitlement.payload,
		kid: entitlement.kid,
		expires_at: entitlement.expiresAt,
		state,
		refused: denied?.code ?? null,
		seats: { used, total: license.maxSeats },
		latest_version: release?.version ?? null
	}, 200, rateLimitHeaders(rate));
};

/** Liveness for uptime checks; deliberately says nothing about any licence. */
export const GET: RequestHandler = async () => ok({ service: 'shiptrack-licence', ready: true });
