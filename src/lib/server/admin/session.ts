import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { auditLogs } from '../db/schema';
import { optional, optionalNumber } from '../env';
import { verifyPassword } from './password';

export interface AdminIdentity {
	email: string;
}

export type LoginResult =
	| { ok: true; email: string }
	| { ok: false; reason: 'bad_credentials' | 'rate_limited' | 'not_configured' };

function windowMinutes(): number {
	return optionalNumber('ADMIN_LOGIN_WINDOW_MINUTES', 15);
}

function maxAttempts(): number {
	return optionalNumber('ADMIN_LOGIN_MAX_ATTEMPTS', 10);
}

/**
 * Counts recent failed logins from one address.
 *
 * The audit log is the source of truth rather than a separate counter table:
 * the failures have to be recorded anyway, a second store would be a second
 * thing to keep in sync, and "how many times has this address failed lately" is
 * a question the audit log already answers.
 */
async function recentFailures(ip: string): Promise<number> {
	const db = getDb();
	const since = new Date(Date.now() - windowMinutes() * 60_000);
	const rows = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.action, 'admin.login_failed'),
				gt(auditLogs.createdAt, since),
				sql`${auditLogs.details}->>'ip' = ${ip}`
			)
		);
	return rows[0]?.count ?? 0;
}

async function record(action: string, actor: string, details: Record<string, unknown>) {
	const db = getDb();
	await db.insert(auditLogs).values({ action, actor, licenseId: null, details });
}

/**
 * Attempts an admin login.
 *
 * Both the missing-user and wrong-password paths run the same scrypt
 * verification and return the same refusal, so the response neither reveals
 * which admin addresses exist nor answers faster for an unknown one.
 */
export async function attemptLogin(
	email: string,
	password: string,
	ip: string
): Promise<LoginResult> {
	const expectedEmail = optional('ADMIN_EMAIL').trim().toLowerCase();
	const expectedHash = optional('ADMIN_PASSWORD_HASH');

	if (!expectedEmail || !expectedHash) {
		return { ok: false, reason: 'not_configured' };
	}

	if ((await recentFailures(ip)) >= maxAttempts()) {
		await record('admin.login_blocked', email, { ip });
		return { ok: false, reason: 'rate_limited' };
	}

	const emailMatches = email.trim().toLowerCase() === expectedEmail;
	const passwordMatches = await verifyPassword(password, expectedHash);

	if (!emailMatches || !passwordMatches) {
		await record('admin.login_failed', email, { ip });
		return { ok: false, reason: 'bad_credentials' };
	}

	await record('admin.login', expectedEmail, { ip });
	return { ok: true, email: expectedEmail };
}

/** Writes an admin action to the audit trail. Every mutation calls this. */
export async function auditAdmin(
	action: string,
	actor: string,
	licenseId: string | null,
	details: Record<string, unknown> = {}
): Promise<void> {
	const db = getDb();
	await db.insert(auditLogs).values({ action, actor, licenseId, details });
}

export async function recentAudit(limit = 50, offset = 0, search = '') {
	const db = getDb();
	const query = db.select().from(auditLogs);
	const filtered = search
		? query.where(
				sql`${auditLogs.action} ILIKE ${'%' + search + '%'} OR ${auditLogs.actor} ILIKE ${'%' + search + '%'}`
			)
		: query;
	return filtered.orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
}
