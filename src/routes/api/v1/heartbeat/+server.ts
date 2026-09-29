import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations } from '$lib/server/db/schema';
import { signingStatus } from '$lib/server/crypto/ed25519';
import { buildEntitlement } from '$lib/server/domain/entitlement';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { countSeats, findActivation } from '$lib/server/domain/seats';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { classifySite } from '$lib/server/domain/site';
import { clientIp, fail, ok, readJson, limited, rateLimitHeaders, signingUnavailable } from '$lib/server/http';
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

	// Before anything is read or written: a check-in that cannot be answered records nothing.
	const signing = signingStatus();
	if (!signing.ready) return signingUnavailable(signing.problem);

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

let lastLogged = 0;

/**
 * Liveness for uptime checks, and the place to confirm the server can sign.
 *
 * Says nothing about any licence. `ready` used to be a constant, so the probe
 * read healthy for five days while every activation and heartbeat failed on a
 * signing key it could not load; the update check, which signs nothing, kept
 * working and made it look like a customer problem. Now it is false, with a
 * 503, whenever an entitlement could not be signed, and the reason is logged.
 *
 * When ready it names the signing key: `kid`, and `public_key` in the form the
 * plugin's `TokenVerifier::PUBLIC_KEYS` holds. The plugin must carry that exact
 * pair, or every site refuses the token (`unknown_key_id`, `bad_signature`).
 * Both are public already, in every plugin zip and every token header.
 */
export const GET: RequestHandler = async () => {
	const headers = { 'Cache-Control': 'no-store' };
	const signing = signingStatus();
	if (!signing.ready) {
		// The site footer polls this on every page view: one line a minute per instance is enough.
		if (Date.now() - lastLogged >= 60_000) {
			lastLogged = Date.now();
			console.error(`[licence] not ready: ${signing.problem}`);
		}
		return json(
			{ ok: false, service: 'shiptrack-licence', ready: false, problems: ['signing'] },
			{ status: 503, headers }
		);
	}
	return ok(
		{ service: 'shiptrack-licence', ready: true, kid: signing.kid, public_key: signing.publicKey },
		200,
		headers
	);
};
