import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { downloadTokens } from '$lib/server/db/schema';
import { generateDownloadToken } from '$lib/server/crypto/keys';
import { optionalNumber, required } from '$lib/server/env';
import {
	findLicenseByKey,
	licenseState,
	refusal,
	stateRefusal
} from '$lib/server/domain/licenses';
import { isNewer, latestRelease } from '$lib/server/domain/releases';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { classifySite } from '$lib/server/domain/site';
import { fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { InvalidField, str } from '$lib/server/validate';

function publicBase(): string {
	return required('PUBLIC_APP_URL').replace(/\/$/, '');
}

/**
 * What `pre_set_site_transient_update_plugins` asks for.
 *
 * Returns the WordPress-shaped update payload when a newer release exists, and
 * `update_available: false` otherwise — never a 404, because WordPress treats a
 * failed update check as a broken plugin and nags the site owner about it.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let siteUrl: string;
	let version: string;
	try {
		key = str(body, 'key', { max: 128 });
		siteUrl = str(body, 'site_url');
		version = str(body, 'version', { max: 32 });
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

	const rate = await meterLicense('updates', license);
	if (rate.limited) {
		return limited(
			rate,
			'This licence is sending requests faster than expected. It will resume automatically.'
		);
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);
	if (denied) {
		return fail(denied);
	}

	const release = await latestRelease();
	if (!release || !isNewer(release.version, version)) {
		return ok({ update_available: false, latest_version: release?.version ?? version }, 200, rateLimitHeaders(rate));
	}

	const site = classifySite(siteUrl);
	if (!site.domain) {
		return fail(refusal('invalid_request', 'site_url did not contain a usable host.', 400));
	}

	const { token, hash } = generateDownloadToken();
	const ttlMinutes = optionalNumber('DOWNLOAD_TOKEN_TTL_MINUTES', 15);

	const db = getDb();
	await db.insert(downloadTokens).values({
		tokenHash: hash,
		licenseId: license.id,
		releaseId: release.id,
		domain: site.domain,
		expiresAt: new Date(Date.now() + ttlMinutes * 60_000)
	});

	const base = publicBase();

	return ok({
		update_available: true,
		new_version: release.version,
		slug: 'shiptrack-pro',
		plugin: 'shiptrack-pro/shiptrack-pro.php',
		package: `${base}/api/v1/updates/download/${token}`,
		tested: release.testedUpTo,
		requires_php: release.minPhp,
		requires: release.minWp,
		icons: {
			'1x': `${base}/assets/icon-128x128.png`,
			'2x': `${base}/assets/icon-256x256.png`
		}
	}, 200, rateLimitHeaders(rate));
};

