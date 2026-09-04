import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { releases, type Release } from '../db/schema';

/**
 * Everything the update path needs, minus the two unbounded text columns.
 *
 * This runs on every heartbeat and every update check just to read a version
 * string, so pulling `changelog` and `changelog_html` along with it moved
 * megabytes over stateless HTTP for nothing.
 */
export type ReleaseSummary = Omit<Release, 'changelog' | 'changelogHtml'>;

/**
 * Compares two dotted version strings numerically.
 *
 * Returns > 0 when `a` is newer. Written out rather than reached for from a
 * library because the only inputs are semantic-release's own tags, and a string
 * compare gets `5.10.0` versus `5.9.0` wrong — which is exactly the release
 * where nobody would be watching for it.
 */
export function compareVersions(a: string, b: string): number {
	const parse = (v: string) =>
		v
			.replace(/^v/, '')
			.split(/[.+-]/)
			.map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));

	const left = parse(a);
	const right = parse(b);
	const length = Math.max(left.length, right.length);

	for (let i = 0; i < length; i += 1) {
		const l = left[i];
		const r = right[i];
		// A prerelease segment (`5.1.0-beta.1`) parses to NaN and sorts below the
		// plain release, which is what semantic-release means by it.
		if (Number.isNaN(l) && Number.isNaN(r)) continue;
		if (Number.isNaN(l)) return -1;
		if (Number.isNaN(r)) return 1;
		if ((l ?? 0) !== (r ?? 0)) return (l ?? 0) - (r ?? 0);
	}
	return 0;
}

export function isNewer(candidate: string, installed: string): boolean {
	return compareVersions(candidate, installed) > 0;
}

/**
 * The newest ingested release, by version rather than by publish order.
 *
 * The two orderings differ when a patch for an older line is published after a
 * newer minor, so the 25 most recent are compared by version rather than simply
 * taking the first. `published_at` is indexed to keep that ordering cheap.
 */
export async function latestRelease(): Promise<ReleaseSummary | undefined> {
	const db = getDb();
	const rows = await db
		.select({
			id: releases.id,
			tag: releases.tag,
			version: releases.version,
			minPhp: releases.minPhp,
			minWp: releases.minWp,
			testedUpTo: releases.testedUpTo,
			r2StorageKey: releases.r2StorageKey,
			fileSize: releases.fileSize,
			fileSha256: releases.fileSha256,
			downloadCount: releases.downloadCount,
			publishedAt: releases.publishedAt
		})
		.from(releases)
		.orderBy(desc(releases.publishedAt))
		.limit(25);

	return rows.reduce<ReleaseSummary | undefined>(
		(best, row) => (!best || isNewer(row.version, best.version) ? row : best),
		undefined
	);
}

/** The full row, changelog included. Only the version-details modal needs it. */
export async function releaseById(id: string): Promise<Release | undefined> {
	const db = getDb();
	const rows = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
	return rows[0];
}
