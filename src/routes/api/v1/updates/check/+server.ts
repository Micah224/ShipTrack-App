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
import { classifySite } from '$lib/server/domain/site';
import { fail, ok, readJson } from '$lib/server/http';

interface CheckBody {
	key?: string;
	site_url?: string;
	install_id?: string;
	version?: string;
}

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
	const body = await readJson<CheckBody>(request);
	if (!body?.key || !body.site_url || !body.version) {
		return fail(refusal('invalid_request', 'key, site_url and version are required.', 400));
	}

	const license = await findLicenseByKey(body.key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const state = licenseState(license);
	const denied = stateRefusal(state);
	if (denied) {
		return fail(denied);
	}

	const release = await latestRelease();
	if (!release || !isNewer(release.version, body.version)) {
		return ok({ update_available: false, latest_version: release?.version ?? body.version });
	}

	const site = classifySite(body.site_url);
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
	});
};

