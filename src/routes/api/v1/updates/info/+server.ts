import type { RequestHandler } from './$types';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { latestRelease } from '$lib/server/domain/releases';
import { optional, required } from '$lib/server/env';
import { fail, ok, readJson } from '$lib/server/http';

interface InfoBody {
	key?: string;
	site_url?: string;
}

/**
 * Feeds the `plugins_api` filter — the "View version details" modal.
 *
 * The shape here is WordPress.org's, not ours: `sections` keys become the
 * modal's tabs, and anything missing renders as an empty tab rather than an
 * error, which is why the changelog falls back to a sentence instead of null.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<InfoBody>(request);
	if (!body?.key) {
		return fail(refusal('invalid_request', 'key is required.', 400));
	}

	const license = await findLicenseByKey(body.key);
	if (!license) {
		return fail(refusal('unknown_key', 'That licence key was not recognised.', 404));
	}

	const denied = stateRefusal(licenseState(license));
	if (denied) return fail(denied);

	const release = await latestRelease();
	if (!release) {
		return fail('no_release', 'No release has been ingested yet.', 404);
	}

	const base = required('PUBLIC_APP_URL').replace(/\/$/, '');

	return ok({
		name: 'ShipTrack Pro',
		slug: 'shiptrack-pro',
		version: release.version,
		author: optional('PLUGIN_AUTHOR', 'ShipTrack Pro'),
		homepage: optional('PLUGIN_HOMEPAGE', base),
		requires: release.minWp,
		requires_php: release.minPhp,
		tested: release.testedUpTo,
		last_updated: release.publishedAt.toISOString(),
		sections: {
			description: optional(
				'PLUGIN_DESCRIPTION',
				'API-first shipment tracking and visibility for WordPress.'
			),
			changelog: release.changelogHtml || '<p>No changelog was published for this release.</p>'
		},
		banners: {
			low: `${base}/assets/banner-772x250.png`,
			high: `${base}/assets/banner-1544x500.png`
		},
		icons: {
			'1x': `${base}/assets/icon-128x128.png`,
			'2x': `${base}/assets/icon-256x256.png`
		},
		download_link: null
	});
};
