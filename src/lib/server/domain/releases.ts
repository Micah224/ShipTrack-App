import { desc } from 'drizzle-orm';
import { getDb } from '../db';
import { releases, type Release } from '../db/schema';

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

/** The newest ingested release, by version rather than by insert order. */
export async function latestRelease(): Promise<Release | undefined> {
	const db = getDb();
	const rows = await db.select().from(releases).orderBy(desc(releases.publishedAt)).limit(25);
	return rows.reduce<Release | undefined>(
		(best, row) => (!best || isNewer(row.version, best.version) ? row : best),
		undefined
	);
}
