import crypto from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { marked } from 'marked';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { releases } from '$lib/server/db/schema';
import { optional, required } from '$lib/server/env';
import { uploadReleaseZip } from '$lib/server/r2';
import { audit } from '$lib/server/domain/licenses';
import { fail, ok } from '$lib/server/http';

/**
 * Constant-time comparison of the delivery signature.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning false, so
 * the lengths are checked first — a forged header of the wrong length would
 * otherwise produce a 500 instead of a 401, which tells an attacker more than
 * the failure itself does.
 */
function signatureMatches(rawBody: string, header: string | null, secret: string): boolean {
	if (!header) return false;
	const digest = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
	const a = Buffer.from(header);
	const b = Buffer.from(digest);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface ReleaseAsset {
	id: number;
	name: string;
}

/**
 * Ingests a published GitHub release.
 *
 * semantic-release attaches `dist/shiptrack-pro-x.y.z.zip` to the release; this
 * pulls that asset, verifies nothing about it beyond its own hash, and parks it
 * in R2. The archive is never served from GitHub directly because that would
 * require handing every customer site a token for a private repository.
 */
export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();

	if (!signatureMatches(rawBody, request.headers.get('x-hub-signature-256'), required('GITHUB_WEBHOOK_SECRET'))) {
		return fail('unauthorized_webhook', 'Signature verification failed.', 401);
	}

	let payload: {
		action?: string;
		release?: { tag_name: string; body?: string; published_at: string; assets: ReleaseAsset[] };
	};
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return fail('invalid_payload', 'Body was not valid JSON.', 400);
	}

	// Every other release action (created, edited, prereleased) is a no-op here.
	// 200 rather than 4xx so GitHub does not mark the hook as failing.
	if (payload.action !== 'published' || !payload.release) {
		return ok({ skipped: true, reason: `action=${payload.action ?? 'none'}` });
	}

	const release = payload.release;
	const version = release.tag_name.replace(/^v/, '');

	const zipAsset = release.assets?.find(
		(asset) => asset.name.startsWith('shiptrack-pro-') && asset.name.endsWith('.zip')
	);
	if (!zipAsset) {
		return fail('missing_asset', 'The release carries no shiptrack-pro-*.zip asset.', 422);
	}

	const octokit = new Octokit({ auth: required('GITHUB_RELEASE_PAT') });
	const asset = await octokit.rest.repos.getReleaseAsset({
		owner: required('GITHUB_OWNER'),
		repo: required('GITHUB_REPO'),
		asset_id: zipAsset.id,
		headers: { accept: 'application/octet-stream' }
	});

	const buffer = Buffer.from(asset.data as unknown as ArrayBuffer);
	const fileSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
	const r2Key = `releases/shiptrack-pro-${version}.zip`;

	await uploadReleaseZip(r2Key, buffer, fileSha256);

	const changelog = release.body ?? '';
	const changelogHtml = await marked.parse(changelog);

	const db = getDb();
	await db
		.insert(releases)
		.values({
			tag: release.tag_name,
			version,
			changelog,
			changelogHtml,
			r2StorageKey: r2Key,
			fileSize: buffer.length,
			fileSha256,
			minPhp: optional('PLUGIN_MIN_PHP', '8.1'),
			minWp: optional('PLUGIN_MIN_WP', '6.5'),
			testedUpTo: optional('PLUGIN_TESTED_UP_TO', '7.0'),
			publishedAt: new Date(release.published_at)
		})
		// Re-publishing the same tag replaces the artefact rather than failing:
		// a corrected release is a normal thing and must not need a DB edit.
		.onConflictDoUpdate({
			target: releases.version,
			set: { changelog, changelogHtml, r2StorageKey: r2Key, fileSize: buffer.length, fileSha256 }
		});

	await audit('release.ingested', 'github-webhook', null, {
		version,
		tag: release.tag_name,
		bytes: buffer.length,
		sha256: fileSha256
	});

	return ok({ version, bytes: buffer.length, sha256: fileSha256, key: r2Key });
};
