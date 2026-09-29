import type { RequestHandler } from './$types';
import { findLicenseByKey, licenseState, refusal, stateRefusal } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { downloadableRelease, downloadUrl, issueDownloadToken } from '$lib/server/domain/releases';
import { classifySite } from '$lib/server/domain/site';
import { fail, ok, readJson, limited, rateLimitHeaders } from '$lib/server/http';
import { InvalidField, str, versionStr } from '$lib/server/validate';

/**
 * A download link for one specific release — what a rollback installs.
 *
 * The link is the update check's own: a single-use token from
 * `issueDownloadToken`, the same TTL, the same table, consumed by
 * `updates/download/[token]`. A rollback therefore gets no longer-lived or
 * more replayable URL than an update does.
 *
 * `requires`, `requires_php` and `tested` come back with it so the plugin can
 * refuse, before downloading anything, a version this site cannot run.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<unknown>(request);

	let key: string;
	let siteUrl: string;
	let version: string;
	try {
		key = str(body, 'key', { max: 128 });
		siteUrl = str(body, 'site_url');
		version = versionStr(body, 'version', { max: 32 });
	} catch (error) {
		if (error instanceof InvalidField) return fail(refusal('invalid_request', error.message, 400));
		throw error;
	}

	const site = classifySite(siteUrl);
	if (!site.domain) {
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

	const release = await downloadableRelease(version);
	if (!release) {
		return fail('unknown_version', `Version ${version} is not available for download.`, 404);
	}

	const { token } = await issueDownloadToken({
		licenseId: license.id,
		releaseId: release.id,
		domain: site.domain
	});

	return ok(
		{
			version: release.version,
			package: downloadUrl(token),
			requires: release.minWp,
			requires_php: release.minPhp,
			tested: release.testedUpTo
		},
		200,
		rateLimitHeaders(rate)
	);
};
