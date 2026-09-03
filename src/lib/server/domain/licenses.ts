import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { auditLogs, licenses, type License } from '../db/schema';
import { hashLicenseKey } from '../crypto/keys';
import { optionalNumber } from '../env';

export type LicenseState = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED';

export interface LicenseRefusal {
	code:
		| 'unknown_key'
		| 'license_revoked'
		| 'license_suspended'
		| 'license_expired'
		| 'seat_limit_reached'
		// The install is registered to another host. Distinct from
		// invalid_request because the plugin's remedy is different: re-activate,
		// which re-checks the seat cap, rather than fix the request.
		| 'domain_changed'
		| 'invalid_request';
	message: string;
	status: number;
}

export function refusal(code: LicenseRefusal['code'], message: string, status = 403): LicenseRefusal {
	return { code, message, status };
}

export async function findLicenseByKey(key: string): Promise<License | undefined> {
	const db = getDb();
	const rows = await db.select().from(licenses).where(eq(licenses.keyHash, hashLicenseKey(key))).limit(1);
	return rows[0];
}

/**
 * Resolves what a licence is entitled to *right now*.
 *
 * A licence past `expiresAt` is not immediately dead: it spends
 * `gracePeriodDays` in GRACE first, which is what protects a paying customer
 * whose card expired on a Friday from losing shipment creation over the
 * weekend. Only after that does it read EXPIRED.
 */
export function licenseState(license: License, now = new Date()): LicenseState {
	if (license.status === 'REVOKED') return 'REVOKED';
	if (license.status === 'SUSPENDED') return 'SUSPENDED';
	if (license.status === 'EXPIRED') return 'EXPIRED';
	if (!license.expiresAt) return 'ACTIVE';

	if (now <= license.expiresAt) return 'ACTIVE';

	const graceEnds = new Date(license.expiresAt);
	graceEnds.setUTCDate(graceEnds.getUTCDate() + license.gracePeriodDays);
	return now <= graceEnds ? 'GRACE' : 'EXPIRED';
}

export function stateRefusal(state: LicenseState): LicenseRefusal | null {
	switch (state) {
		case 'REVOKED':
			return refusal('license_revoked', 'This licence has been revoked.');
		case 'SUSPENDED':
			return refusal('license_suspended', 'This licence is suspended.');
		case 'EXPIRED':
			return refusal('license_expired', 'This licence has expired.');
		default:
			return null;
	}
}

/** How long an unreachable install keeps its seat before it is reclaimed. */
export function reclaimAfterDays(): number {
	return optionalNumber('SEAT_RECLAIM_DAYS', 21);
}

export async function audit(
	action: string,
	actor: string,
	licenseId: string | null,
	details: Record<string, unknown> = {}
): Promise<void> {
	const db = getDb();
	await db.insert(auditLogs).values({ action, actor, licenseId, details });
}
