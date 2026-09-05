import type { RequestHandler } from './$types';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { latestRelease, releaseById } from '$lib/server/domain/releases';
import { optional, required } from '$lib/server/env';
import { fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { InvalidField, str } from '$lib/server/validate';

/**
 * Feeds the `plugins_api` filter — the "View version details" modal.
 *
 * The shape here is WordPress.org's, not ours: `sections` keys become the
 * modal's tabs, and anything missing renders as an empty tab rather than an
 * error, which is why the changelog falls back to a sentence instead of null.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	try {
		key = str(body, 'key', { max: 128 });
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

	const denied = stateRefusal(licenseState(license));
	if (denied) return fail(denied);

	const summary = await latestRelease();
	if (!summary) {
		return fail('no_release', 'No release has been ingested yet.', 404);
	}

	// The only endpoint that needs the changelog, so it is the only one that
	// pays for fetching it.
	const release = await releaseById(summary.id);
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
	}, 200, rateLimitHeaders(rate));
};
