import { eq, sql } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { downloadTokens, releases } from '$lib/server/db/schema';
import { hashDownloadToken } from '$lib/server/crypto/keys';
import { presignReleaseDownload } from '$lib/server/r2';
import { audit } from '$lib/server/domain/licenses';
import { fail } from '$lib/server/http';

/**
 * Resolves a single-use download token into a presigned R2 URL.
 *
 * The token is consumed before the redirect is issued, not after: WordPress
 * follows the 302 itself, so there is no second request to consume it on, and
 * a token that stayed live until download completion would be replayable for
 * as long as the transfer took.
 *
 * The 302 is what keeps the archive off this function entirely — Cloudflare
 * serves the bytes from its own edge, at no egress cost and no CPU here.
 */
export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const tokenHash = hashDownloadToken(params.token);

	const rows = await db
		.select({ token: downloadTokens, release: releases })
		.from(downloadTokens)
		.innerJoin(releases, eq(downloadTokens.releaseId, releases.id))
		.where(eq(downloadTokens.tokenHash, tokenHash))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return fail('invalid_token', 'This download link is not valid.', 404);
	}
	if (row.token.usedAt) {
		return fail('token_consumed', 'This download link has already been used.', 410);
	}
	if (row.token.expiresAt.getTime() < Date.now()) {
		return fail('token_expired', 'This download link has expired. Re-check for updates.', 410);
	}

	await db
		.update(downloadTokens)
		.set({ usedAt: new Date() })
		.where(eq(downloadTokens.id, row.token.id));

	await db
		.update(releases)
		.set({ downloadCount: sql`${releases.downloadCount} + 1` })
		.where(eq(releases.id, row.release.id));

	await audit('release.downloaded', row.token.domain, row.token.licenseId, {
		version: row.release.version
	});

	const url = await presignReleaseDownload(
		row.release.r2StorageKey,
		`shiptrack-pro-${row.release.version}.zip`
	);

	redirect(302, url);
};
