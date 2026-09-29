import { and, desc, eq, gt, ne, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { downloadTokens, releases, type Release } from '../db/schema.ts';
import { generateDownloadToken } from '../crypto/keys.ts';
import { optionalNumber, required } from '../env.ts';

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

/** The summary columns, spelled once so every read below selects the same shape. */
const summaryColumns = {
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
};

/**
 * How many of the most recently published rows are compared by version. The
 * latest release and the rollback list both read this window, so the entry the
 * list marks `latest` is always the one `updates/check` offers.
 */
const RECENT_WINDOW = 25;

/** Most versions the rollback list returns. */
export const ROLLBACK_LIST_LIMIT = 10;

/**
 * Longest stored changelog HTML the rollback list carries per version, in
 * characters. Cut in the query, so a runaway release body is never pulled over
 * HTTP only to be thrown away; `truncateChangelogHtml` finishes the job.
 */
export const CHANGELOG_EXCERPT_CHARS = 8000;

/** What every endpoint shows for a release that shipped without notes. */
export const NO_CHANGELOG_HTML = '<p>No changelog was published for this release.</p>';

/**
 * What "can be downloaded" means, in one place.
 *
 * The table has no published or yanked flag: the webhook uploads the zip to R2
 * before it inserts the row, so a row exists only once its archive does. What
 * this guards against is a row that names no archive, or an empty one — a
 * download token issued for either would 302 to nothing. If a yank column is
 * ever added, it belongs here, and every read below picks it up.
 */
function downloadable(): SQL {
	return and(ne(releases.r2StorageKey, ''), gt(releases.fileSize, 0)) as SQL;
}

function newestFirst<T extends { version: string }>(rows: T[]): T[] {
	return [...rows].sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * The newest downloadable release, by version rather than by publish order.
 *
 * The two orderings differ when a patch for an older line is published after a
 * newer minor, so the 25 most recent are compared by version rather than simply
 * taking the first. `published_at` is indexed to keep that ordering cheap.
 */
export async function latestRelease(): Promise<ReleaseSummary | undefined> {
	const db = getDb();
	const rows = await db
		.select(summaryColumns)
		.from(releases)
		.where(downloadable())
		.orderBy(desc(releases.publishedAt))
		.limit(RECENT_WINDOW);

	return newestFirst(rows)[0];
}

export interface ReleaseListing extends ReleaseSummary {
	/** The first `CHANGELOG_EXCERPT_CHARS` of the stored HTML, or null when none was stored. */
	changelogHtml: string | null;
	/** Length of the whole stored HTML, so the caller knows whether the excerpt is all of it. */
	changelogLength: number;
}

/**
 * The versions a site may roll back (or forward) to, newest version first.
 *
 * Same window and same predicate as `latestRelease`, so the first entry here is
 * exactly what the update check offers. The changelog is cut to an excerpt in
 * Postgres: `latestRelease` exists precisely because pulling every changelog
 * in full moved megabytes for nothing.
 */
export async function downloadableReleases(limit = ROLLBACK_LIST_LIMIT): Promise<ReleaseListing[]> {
	const db = getDb();
	const rows = await db
		.select({
			...summaryColumns,
			changelogHtml: sql<string | null>`left(${releases.changelogHtml}, ${CHANGELOG_EXCERPT_CHARS}::int)`,
			changelogLength: sql<number>`coalesce(char_length(${releases.changelogHtml}), 0)`.mapWith(Number)
		})
		.from(releases)
		.where(downloadable())
		.orderBy(desc(releases.publishedAt))
		.limit(RECENT_WINDOW);

	return newestFirst(rows).slice(0, limit);
}

/** One release by its exact version, only if it can be downloaded. */
export async function downloadableRelease(version: string): Promise<ReleaseSummary | undefined> {
	const db = getDb();
	const rows = await db
		.select(summaryColumns)
		.from(releases)
		.where(and(eq(releases.version, version), downloadable()))
		.limit(1);
	return rows[0];
}

export interface DownloadGrant {
	licenseId: string;
	releaseId: string;
	/** The normalised host the token is issued to, recorded for the audit trail. */
	domain: string;
}

/**
 * Issues a single-use download token for one release.
 *
 * The update check and the rollback package endpoint both come through here,
 * so a rollback download is exactly as short-lived, single-use and
 * hash-only-at-rest as an update: the raw token exists in the returned URL and
 * nowhere else. `updates/download/[token]` consumes it.
 */
export async function issueDownloadToken(grant: DownloadGrant): Promise<{ token: string; expiresAt: Date }> {
	const { token, hash } = generateDownloadToken();
	const ttlMinutes = optionalNumber('DOWNLOAD_TOKEN_TTL_MINUTES', 15);
	const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

	const db = getDb();
	await db.insert(downloadTokens).values({
		tokenHash: hash,
		licenseId: grant.licenseId,
		releaseId: grant.releaseId,
		domain: grant.domain,
		expiresAt
	});

	return { token, expiresAt };
}

/** The URL WordPress is handed for a token from `issueDownloadToken`. */
export function downloadUrl(token: string): string {
	return `${required('PUBLIC_APP_URL').replace(/\/$/, '')}/api/v1/updates/download/${token}`;
}

/** The full row, changelog included. Only the version-details modal needs it. */
export async function releaseById(id: string): Promise<Release | undefined> {
	const db = getDb();
	const rows = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
	return rows[0];
}
