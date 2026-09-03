import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { activations, customers, licenses, releases } from '../db/schema';
import { licenseState } from '../domain/licenses';
import { DEFAULT_SEATS, type Tier } from '../domain/tiers';
import { sanitizeChangelogHtml } from '../sanitize';

export interface DashboardStats {
	licenses: { total: number; active: number; revoked: number; expired: number; suspended: number };
	byTier: { tier: string; count: number }[];
	seats: { used: number; capacity: number };
	installs: { production: number; nonProduction: number; stale: number };
	versions: { version: string; installs: number }[];
	latestRelease: { version: string; publishedAt: Date } | null;
}

/** How long without a heartbeat before an install is shown as stale. */
const STALE_DAYS = 3;

export async function dashboardStats(): Promise<DashboardStats> {
	const db = getDb();

	const [tierRows, statusRows, capacityRow, seatRow, installRows, versionRows, releaseRow] =
		await Promise.all([
			db.select({ tier: licenses.tier, count: count() }).from(licenses).groupBy(licenses.tier),
			db.select({ status: licenses.status, count: count() }).from(licenses).groupBy(licenses.status),
			db
				.select({ capacity: sql<number>`coalesce(sum(${licenses.maxSeats}), 0)::int` })
				.from(licenses)
				.where(eq(licenses.status, 'ACTIVE')),
			db
				.select({ used: sql<number>`count(*)::int` })
				.from(activations)
				.where(and(isNull(activations.releasedAt), eq(activations.countsSeat, true))),
			db
				.select({ countsSeat: activations.countsSeat, count: count() })
				.from(activations)
				.where(isNull(activations.releasedAt))
				.groupBy(activations.countsSeat),
			db
				.select({ version: activations.pluginVersion, installs: count() })
				.from(activations)
				.where(isNull(activations.releasedAt))
				.groupBy(activations.pluginVersion),
			db
				.select({ version: releases.version, publishedAt: releases.publishedAt })
				.from(releases)
				.orderBy(desc(releases.publishedAt))
				.limit(1)
		]);

	const staleRow = await db
		.select({ stale: sql<number>`count(*)::int` })
		.from(activations)
		.where(
			and(
				isNull(activations.releasedAt),
				sql`${activations.lastHeartbeat} < now() - make_interval(days => ${STALE_DAYS})`
			)
		);

	const status = (name: string) =>
		statusRows.find((row) => row.status === name)?.count ?? 0;

	return {
		licenses: {
			total: statusRows.reduce((sum, row) => sum + row.count, 0),
			active: status('ACTIVE'),
			revoked: status('REVOKED'),
			expired: status('EXPIRED'),
			suspended: status('SUSPENDED')
		},
		byTier: tierRows.map((row) => ({ tier: row.tier, count: row.count })),
		seats: { used: seatRow[0]?.used ?? 0, capacity: capacityRow[0]?.capacity ?? 0 },
		installs: {
			production: installRows.find((row) => row.countsSeat)?.count ?? 0,
			nonProduction: installRows.find((row) => !row.countsSeat)?.count ?? 0,
			stale: staleRow[0]?.stale ?? 0
		},
		// Newest first, so the adoption list reads as a rollout rather than
		// alphabetically, where 5.10.0 would sort under 5.9.0.
		versions: versionRows.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })),
		latestRelease: releaseRow[0] ?? null
	};
}

export interface LicenseRow {
	id: string;
	keyPrefix: string;
	label: string | null;
	tier: string;
	status: string;
	maxSeats: number;
	seatsUsed: number;
	expiresAt: Date | null;
	state: string;
	customerEmail: string;
	customerName: string;
	createdAt: Date;
}

export async function listLicenses(search = ''): Promise<LicenseRow[]> {
	const db = getDb();

	// Live seat counts come from a grouped sub-select rather than a query per
	// row: the licence list is the console's busiest page and N+1 there would
	// be N+1 stateless HTTPS round trips, not N+1 cheap local queries.
	const seatCounts = db
		.select({
			licenseId: activations.licenseId,
			used: sql<number>`count(*)::int`.as('used')
		})
		.from(activations)
		.where(and(isNull(activations.releasedAt), eq(activations.countsSeat, true)))
		.groupBy(activations.licenseId)
		.as('seat_counts');

	const rows = await db
		.select({
			id: licenses.id,
			keyPrefix: licenses.keyPrefix,
			label: licenses.label,
			tier: licenses.tier,
			status: licenses.status,
			maxSeats: licenses.maxSeats,
			expiresAt: licenses.expiresAt,
			gracePeriodDays: licenses.gracePeriodDays,
			createdAt: licenses.createdAt,
			customerEmail: customers.email,
			customerName: customers.name,
			seatsUsed: sql<number>`coalesce(${seatCounts.used}, 0)::int`
		})
		.from(licenses)
		.innerJoin(customers, eq(licenses.customerId, customers.id))
		.leftJoin(seatCounts, eq(seatCounts.licenseId, licenses.id))
		.where(
			search
				? sql`${customers.email} ILIKE ${'%' + search + '%'}
					OR ${customers.name} ILIKE ${'%' + search + '%'}
					OR ${licenses.keyPrefix} ILIKE ${'%' + search + '%'}
					OR coalesce(${licenses.label}, '') ILIKE ${'%' + search + '%'}`
				: undefined
		)
		.orderBy(desc(licenses.createdAt))
		.limit(200);

	return rows.map((row) => ({
		...row,
		state: licenseState({
			status: row.status,
			expiresAt: row.expiresAt,
			gracePeriodDays: row.gracePeriodDays
		} as never)
	}));
}

export async function listActivations(search = '') {
	const db = getDb();
	return db
		.select({
			id: activations.id,
			licenseId: activations.licenseId,
			installId: activations.installId,
			domain: activations.domain,
			siteUrl: activations.siteUrl,
			environment: activations.environment,
			countsSeat: activations.countsSeat,
			pluginVersion: activations.pluginVersion,
			wpVersion: activations.wpVersion,
			phpVersion: activations.phpVersion,
			lastHeartbeat: activations.lastHeartbeat,
			releasedAt: activations.releasedAt,
			releaseReason: activations.releaseReason,
			keyPrefix: licenses.keyPrefix,
			customerEmail: customers.email
		})
		.from(activations)
		.innerJoin(licenses, eq(activations.licenseId, licenses.id))
		.innerJoin(customers, eq(licenses.customerId, customers.id))
		.where(
			search
				? sql`${activations.domain} ILIKE ${'%' + search + '%'} OR ${customers.email} ILIKE ${'%' + search + '%'}`
				: undefined
		)
		.orderBy(desc(activations.lastHeartbeat))
		.limit(200);
}

export async function listReleases() {
	const db = getDb();
	const rows = await db.select().from(releases).orderBy(desc(releases.publishedAt)).limit(50);

	/*
	 * Sanitized again on the way out, even though the webhook sanitizes on the
	 * way in. The console renders this with {@html}, and a row written before
	 * the ingestion sanitizer existed -- or by any future path that forgets --
	 * would otherwise reach the browser raw. Sanitizing twice costs nothing and
	 * means the render site does not depend on every writer behaving.
	 */
	return rows.map((row) => ({
		...row,
		changelogHtml: row.changelogHtml ? sanitizeChangelogHtml(row.changelogHtml) : null
	}));
}

export function defaultSeatsForTier(tier: Tier): number {
	return DEFAULT_SEATS[tier] ?? 1;
}
