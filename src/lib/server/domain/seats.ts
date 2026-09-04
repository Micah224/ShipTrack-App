import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { activations, type Activation, type License } from '../db/schema';
import type { SiteIdentity } from './site';

/*
 * Seat accounting lives here and nowhere else.
 *
 * It was previously spread across the activate handler in three branches, and
 * each branch got the cap wrong in a different way: re-activating a released
 * install un-released it without checking, and an install that flipped from
 * staging to production started consuming a seat without checking. Both are the
 * same mistake — deciding "does this need a seat?" somewhere other than where
 * the seat is taken.
 */

export interface SeatTelemetry {
	siteUrl: string;
	ipAddress: string | null;
	pluginVersion: string;
	wpVersion: string | null;
	phpVersion: string | null;
	activeMapProvider: string | null;
	transportModesUsed: string[];
}

export type SeatOutcome =
	| { ok: true; activation: Activation; used: number }
	| { ok: false; used: number };

/**
 * Live seats: unreleased activations that actually count against the cap.
 */
export async function countSeats(licenseId: string): Promise<number> {
	const db = getDb();
	const rows = await db
		.select({ used: sql<number>`count(*)::int` })
		.from(activations)
		.where(
			and(
				eq(activations.licenseId, licenseId),
				isNull(activations.releasedAt),
				eq(activations.countsSeat, true)
			)
		);
	return rows[0]?.used ?? 0;
}

/**
 * Claims (or re-claims) a seat for one install.
 *
 * Enforcing the cap correctly here is harder than it looks, and the obvious
 * approaches are both wrong:
 *
 *   - Read the count, then insert. Two concurrent activations both read the
 *     last free seat as available and both take it.
 *   - Put the count in a WHERE guard on the insert and call it atomic. It is
 *     not: under READ COMMITTED the subquery reads the snapshot taken at
 *     statement start, and two inserts of *different* rows never block each
 *     other, so both guards still pass. This was tried, and the integration
 *     test caught it by failing intermittently.
 *
 * Locking would settle it, but neon-http has no multi-statement transaction to
 * hold a lock across.
 *
 * So the cap is enforced after the fact, deterministically. Every claim writes
 * its row, then asks Postgres where it ranks among the live seat-holders
 * ordered by `seat_claimed_at`. Ranks beyond `maxSeats` release themselves.
 * Because the ordering is total and every racer sees the same committed rows,
 * exactly the first `maxSeats` survive whatever the interleaving — no lock, no
 * retry loop, and no window in which the count is over.
 *
 * The guard on the insert is kept as a fast path: it rejects the common,
 * uncontended over-claim without writing anything.
 */
export async function claimSeat(
	license: License,
	installId: string,
	site: SiteIdentity,
	telemetry: SeatTelemetry
): Promise<SeatOutcome> {
	const db = getDb();

	// A non-production site never touches the cap, so it needs no guard at all.
	const guard = site.countsSeat
		? sql`AND (
				SELECT count(*) FROM ${activations}
				WHERE ${activations.licenseId} = ${license.id}
				  AND ${activations.releasedAt} IS NULL
				  AND ${activations.countsSeat} = true
				  AND ${activations.installId} <> ${installId}
			) < ${license.maxSeats}`
		: sql``;

	const inserted = await db.execute(sql`
		INSERT INTO ${activations} (
			license_id, install_id, domain, site_url, ip_address, plugin_version,
			wp_version, php_version, active_map_provider, transport_modes_used,
			environment, counts_seat, last_heartbeat, seat_claimed_at
		)
		SELECT
			${license.id}, ${installId}, ${site.domain}, ${telemetry.siteUrl},
			${telemetry.ipAddress}, ${telemetry.pluginVersion}, ${telemetry.wpVersion},
			${telemetry.phpVersion}, ${telemetry.activeMapProvider},
			${JSON.stringify(telemetry.transportModesUsed)}::jsonb,
			${site.environment}::activation_environment, ${site.countsSeat}, now(), now()
		WHERE true ${guard}
		ON CONFLICT (license_id, install_id) DO UPDATE SET
			domain = EXCLUDED.domain,
			site_url = EXCLUDED.site_url,
			ip_address = EXCLUDED.ip_address,
			plugin_version = EXCLUDED.plugin_version,
			wp_version = EXCLUDED.wp_version,
			php_version = EXCLUDED.php_version,
			active_map_provider = EXCLUDED.active_map_provider,
			transport_modes_used = EXCLUDED.transport_modes_used,
			environment = EXCLUDED.environment,
			counts_seat = EXCLUDED.counts_seat,
			last_heartbeat = now(),
			-- Only re-queue when this install was not already holding a seat.
			-- A live install re-activating keeps its place; a released one, or
			-- one promoted from staging to production, goes to the back.
			seat_claimed_at = CASE
				WHEN ${activations.releasedAt} IS NOT NULL OR ${activations.countsSeat} = false
				THEN now() ELSE ${activations.seatClaimedAt}
			END,
			released_at = NULL,
			release_reason = NULL
		RETURNING id
	`);

	const written = (inserted as unknown as { rows?: unknown[] }).rows ?? (inserted as unknown as unknown[]);
	if (!Array.isArray(written) || written.length === 0) {
		// The fast-path guard rejected it: every seat is held by another install.
		return { ok: false, used: await countSeats(license.id) };
	}

	if (site.countsSeat) {
		const evicted = await db.execute(sql`
			WITH live AS (
				SELECT id, row_number() OVER (ORDER BY seat_claimed_at, id) AS rn
				FROM ${activations}
				WHERE ${activations.licenseId} = ${license.id}
				  AND ${activations.releasedAt} IS NULL
				  AND ${activations.countsSeat} = true
			)
			UPDATE ${activations} a
			SET released_at = now(), release_reason = 'SUPERSEDED'
			FROM live
			WHERE a.id = live.id
			  AND live.rn > ${license.maxSeats}
			  AND a.license_id = ${license.id}
			  AND a.install_id = ${installId}
			RETURNING a.id
		`);

		const lost = (evicted as unknown as { rows?: unknown[] }).rows ?? (evicted as unknown as unknown[]);
		if (Array.isArray(lost) && lost.length > 0) {
			return { ok: false, used: await countSeats(license.id) };
		}
	}

	/*
	 * `db.execute` returns raw driver rows carrying the database's snake_case
	 * names, not Drizzle's camelCase mapping, so the activation is read back
	 * through the query builder rather than cast. The cast compiled and lied:
	 * every camelCase field on it was undefined.
	 */
	const activation = await findActivation(license.id, installId);
	if (!activation) {
		return { ok: false, used: await countSeats(license.id) };
	}

	return { ok: true, activation, used: await countSeats(license.id) };
}

/**
 * Releases a seat. Rows are stamped rather than deleted — support and the abuse
 * queue both need to see that a site was here and left.
 */
export async function releaseSeat(
	licenseId: string,
	installId: string,
	reason: 'SELF_SERVICE' | 'AUTO_RECLAIM' | 'ADMIN' = 'SELF_SERVICE'
): Promise<Activation | undefined> {
	const db = getDb();
	const rows = await db
		.update(activations)
		.set({ releasedAt: new Date(), releaseReason: reason })
		.where(
			and(
				eq(activations.licenseId, licenseId),
				eq(activations.installId, installId),
				isNull(activations.releasedAt)
			)
		)
		.returning();
	return rows[0];
}

export async function findActivation(
	licenseId: string,
	installId: string
): Promise<Activation | undefined> {
	const db = getDb();
	const rows = await db
		.select()
		.from(activations)
		.where(and(eq(activations.licenseId, licenseId), eq(activations.installId, installId)))
		.limit(1);
	return rows[0];
}
