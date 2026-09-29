import type { RequestHandler } from './$types';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import {
	CHANGELOG_EXCERPT_CHARS,
	downloadableReleases,
	NO_CHANGELOG_HTML
} from '$lib/server/domain/releases';
import { classifySite } from '$lib/server/domain/site';
import { fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { truncateChangelogHtml } from '$lib/server/sanitize';
import { InvalidField, str } from '$lib/server/validate';

/**
 * The versions the plugin's Licence page offers to roll back to.
 *
 * Newest version first, at most ten, and only releases that can actually be
 * downloaded — listing one that `updates/package` would then refuse is a
 * button that fails. `latest` marks the entry `updates/check` offers, which
 * `downloadableReleases` guarantees by reading the same window.
 *
 * No releases is `versions: []`, not a 404, for the same reason the update
 * check never 404s: an empty list is an answer, not a fault.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let siteUrl: string;
	try {
		key = str(body, 'key', { max: 128 });
		siteUrl = str(body, 'site_url');
	} catch (error) {
		if (error instanceof InvalidField) return fail(refusal('invalid_request', error.message, 400));
		throw error;
	}

	// Checked here, not only in updates/package, so a site that could never be
	// handed an archive is not first shown a list of them.
	if (!classifySite(siteUrl).domain) {
		return fail(refusal('invalid_request', 'site_url did not contain a usable host.', 400));
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

	const listed = await downloadableReleases();

	return ok(
		{
			versions: listed.map((release, index) => ({
				version: release.version,
				published_at: release.publishedAt.toISOString(),
				// Sanitised again on the way out, as the admin console does: this
				// renders in wp-admin, and an excerpt is new markup besides.
				changelog_html:
					(release.changelogHtml &&
						truncateChangelogHtml(release.changelogHtml, CHANGELOG_EXCERPT_CHARS, release.changelogLength)) ||
					NO_CHANGELOG_HTML,
				latest: index === 0
			}))
		},
		200,
		rateLimitHeaders(rate)
	);
};
