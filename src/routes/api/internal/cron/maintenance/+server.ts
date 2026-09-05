import { and, eq, isNull, lt } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { activations, auditLogs, downloadTokens, rateCounters } from '$lib/server/db/schema';
import { reclaimAfterDays } from '$lib/server/domain/licenses';
import { optional } from '$lib/server/env';
import { fail, ok } from '$lib/server/http';
import { timingSafeEqualString } from '$lib/server/crypto/compare';

/**
 * Scheduled maintenance. Two jobs that were previously declared and never run.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. If no
 * secret is configured the endpoint refuses rather than running unauthenticated
 * -- an open endpoint that deletes rows is worse than a cron that never fires,
 * because the second failure is visible and the first is not.
 */
export const GET: RequestHandler = async ({ request }) => {
	const secret = optional('CRON_SECRET');
	if (!secret) {
		return fail('cron_not_configured', 'CRON_SECRET is not set on this deployment.', 503);
	}

	const presented = request.headers.get('authorization') ?? '';
	if (!timingSafeEqualString(presented, `Bearer ${secret}`)) {
		return fail('unauthorized', 'Bad or missing cron credentials.', 401);
	}

	const db = getDb();

	/*
	 * 1. Purge spent download tokens.
	 *
	 * Every update check by every install inserts one. Nothing deleted them, so
	 * the table grew unbounded for the lifetime of the product. A day's grace
	 * past expiry keeps them around long enough to explain a failed download.
	 */
	const cutoff = new Date(Date.now() - 86_400_000);
	const purged = await db
		.delete(downloadTokens)
		.where(lt(downloadTokens.expiresAt, cutoff))
		.returning({ id: downloadTokens.id });

	/*
	 * 2. Reclaim seats from installs that stopped checking in.
	 *
	 * A site that is deleted rather than deactivated would otherwise hold its
	 * seat forever, and the customer's only remedy would be to contact support.
	 * SEAT_RECLAIM_DAYS has been advertised in .env.example since the first
	 * commit; this is what makes it true.
	 */
	const staleBefore = new Date(Date.now() - reclaimAfterDays() * 86_400_000);
	const reclaimed = await db
		.update(activations)
		.set({ releasedAt: new Date(), releaseReason: 'AUTO_RECLAIM' })
		.where(
			and(
				isNull(activations.releasedAt),
				eq(activations.countsSeat, true),
				lt(activations.lastHeartbeat, staleBefore)
			)
		)
		.returning({ id: activations.id, licenseId: activations.licenseId, domain: activations.domain });

	if (reclaimed.length > 0) {
		await db.insert(auditLogs).values(
			reclaimed.map((row) => ({
				licenseId: row.licenseId,
				action: 'license.seat_reclaimed',
				actor: 'cron',
				details: { domain: row.domain, stale_since_days: reclaimAfterDays() }
			}))
		);
	}

	/*
	 * 3. Sweep spent rate-limit counters.
	 *
	 * Every metered request touches a row here, so this is the fastest-growing
	 * table in the schema and the one most able to become its own denial of
	 * service. A window that closed two hours ago can answer no question: the
	 * longest bucket is an hour, so nothing still consults it.
	 *
	 * Deleted rather than aggregated on purpose. The counters exist to make a
	 * decision inside one window, not to be analytics; the audit log already
	 * records the transition past a limit, which is the part worth keeping.
	 */
	const counterCutoff = new Date(Date.now() - 2 * 3_600_000);
	const sweptCounters = await db
		.delete(rateCounters)
		.where(lt(rateCounters.windowStart, counterCutoff))
		.returning({ bucket: rateCounters.bucket });

	return ok({
		purged_tokens: purged.length,
		reclaimed_seats: reclaimed.length,
		swept_rate_counters: sweptCounters.length,
		reclaim_after_days: reclaimAfterDays()
	});
};

