import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations } from '$lib/server/db/schema';
import { buildEntitlement } from '$lib/server/domain/entitlement';
import {
	audit,
	countSeats,
	findLicenseByKey,
	licenseState,
	refusal,
	stateRefusal
} from '$lib/server/domain/licenses';
import { classifySite } from '$lib/server/domain/site';
import { clientIp, fail, ok, readJson } from '$lib/server/http';

interface ActivateBody {
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

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<ActivateBody>(request);
	if (!body?.key || !body.site_url || !body.install_id || !body.plugin_version) {
		return fail(
			refusal('invalid_request', 'key, site_url, install_id and plugin_version are required.', 400)
		);
	}

	const license = await findLicenseByKey(body.key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);
	if (denied) {
		await audit('license.activate_denied', body.site_url, license.id, { reason: denied.code });
		return fail(denied);
	}

	const site = classifySite(body.site_url);
	if (!site.domain) {
		return fail(refusal('invalid_request', 'site_url did not contain a usable host.', 400));
	}

	const db = getDb();
	const existing = await db
		.select()
		.from(activations)
		.where(
			and(eq(activations.licenseId, license.id), eq(activations.installId, body.install_id))
		)
		.limit(1);

	const telemetry = {
		domain: site.domain,
		siteUrl: body.site_url,
		ipAddress: clientIp(request),
		pluginVersion: body.plugin_version,
		wpVersion: body.wp_version ?? null,
		phpVersion: body.php_version ?? null,
		activeMapProvider: body.map_provider ?? null,
		transportModesUsed: body.transport_modes ?? [],
		environment: site.environment,
		countsSeat: site.countsSeat,
		lastHeartbeat: new Date()
	};

	let used = await countSeats(license.id);

	if (existing[0]) {
		// A re-activation of an install we already know: refresh its telemetry and
		// un-release it if it had been deactivated. No seat is consumed twice.
		await db
			.update(activations)
			.set({ ...telemetry, releasedAt: null, releaseReason: null })
			.where(eq(activations.id, existing[0].id));

		if (existing[0].releasedAt && site.countsSeat) used += 1;
	} else {
		if (site.countsSeat && used >= license.maxSeats) {
			await audit('license.seat_limit', site.domain, license.id, {
				used,
				max: license.maxSeats,
				install_id: body.install_id
			});
			return fail(
				refusal(
					'seat_limit_reached',
					`This licence covers ${license.maxSeats} production site(s) and all are in use. Deactivate one, or upgrade the licence.`
				)
			);
		}

		await db.insert(activations).values({
			licenseId: license.id,
			installId: body.install_id,
			...telemetry
		});

		if (site.countsSeat) used += 1;
	}

	const entitlement = buildEntitlement(
		license,
		{ domain: site.domain, installId: body.install_id },
		state,
		{ used, total: license.maxSeats },
		body.nonce
	);

	await audit('license.activated', site.domain, license.id, {
		install_id: body.install_id,
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
		seats: { used, total: license.maxSeats }
	});
};
