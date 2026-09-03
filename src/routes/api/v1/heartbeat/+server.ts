import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations } from '$lib/server/db/schema';
import { buildEntitlement } from '$lib/server/domain/entitlement';
import {
	countSeats,
	findLicenseByKey,
	licenseState,
	refusal,
	stateRefusal
} from '$lib/server/domain/licenses';
import { classifySite } from '$lib/server/domain/site';
import { clientIp, fail, ok, readJson } from '$lib/server/http';
import { latestRelease } from '$lib/server/domain/releases';

interface HeartbeatBody {
	key?: string;
	site_url?: string;
	install_id?: string;
	plugin_version?: string;
	wp_version?: string;
	php_version?: string;
	map_provider?: string;
	transport_modes?: string[];
	nonce?: string;
}

/**
 * The plugin's periodic check-in. Re-signs a fresh entitlement, refreshes
 * telemetry, and tells the site whether a newer release exists so the update
 * check has something to act on without a second round trip.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<HeartbeatBody>(request);
	if (!body?.key || !body.site_url || !body.install_id) {
		return fail(refusal('invalid_request', 'key, site_url and install_id are required.', 400));
	}

	const license = await findLicenseByKey(body.key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const site = classifySite(body.site_url);
	const db = getDb();
	const rows = await db
		.select()
		.from(activations)
		.where(and(eq(activations.licenseId, license.id), eq(activations.installId, body.install_id)))
		.limit(1);

	const activation = rows[0];
	if (!activation || activation.releasedAt) {
		// Not an error the plugin should sit on: it needs to re-activate, which is
		// a different call, so say precisely that rather than returning 403.
		return fail(
			refusal('invalid_request', 'This install is not activated. Call /api/v1/activate first.', 409)
		);
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);

	await db
		.update(activations)
		.set({
			domain: site.domain,
			siteUrl: body.site_url,
			ipAddress: clientIp(request),
			pluginVersion: body.plugin_version ?? activation.pluginVersion,
			wpVersion: body.wp_version ?? activation.wpVersion,
			phpVersion: body.php_version ?? activation.phpVersion,
			activeMapProvider: body.map_provider ?? activation.activeMapProvider,
			transportModesUsed: body.transport_modes ?? activation.transportModesUsed,
			environment: site.environment,
			countsSeat: site.countsSeat,
			lastHeartbeat: new Date()
		})
		.where(eq(activations.id, activation.id));

	const used = await countSeats(license.id);
	const entitlement = buildEntitlement(
		license,
		{ domain: site.domain, installId: body.install_id },
		state,
		{ used, total: license.maxSeats },
		body.nonce
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
	});
};

/** Liveness for uptime checks; deliberately says nothing about any licence. */
export const GET: RequestHandler = async () => ok({ service: 'shiptrack-licence', ready: true });


