import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { optional, optionalNumber } from '../env.ts';
import { verifyPassword } from './password.ts';

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
 * The cap that actually bounds guessing, across all addresses.
 *
 * Deliberately looser than the per-address cap: it exists to make brute force
 * impossible, not to be the first thing an honest operator hits.
 */
function maxAttemptsGlobal(): number {
	return optionalNumber('ADMIN_LOGIN_MAX_ATTEMPTS_GLOBAL', 50);
}

/**
 * Counts recent failed logins, globally and from one claimed address.
 *
 * The audit log is the source of truth rather than a separate counter table:
 * the failures have to be recorded anyway, a second store would be a second
 * thing to keep in sync, and "how many failures lately" is a question the audit
 * log already answers.
 *
 * WHY TWO COUNTERS
 *   The per-address one cannot be a security control, because the address is
 *   the caller's own `X-Forwarded-For`. An attacker who hits the cap changes
 *   one character of that header and gets a fresh budget — which is exactly
 *   what a probe of this endpoint demonstrated: ten 401s, a 429, then a plain
 *   401 again from a header that differed by one digit. Keying only on the
 *   address therefore bounded nothing at all.
 *
 *   So the global count is the control, and the per-address count is kept as a
 *   courtesy that stops one misconfigured client from spending the global
 *   budget. There is exactly one admin account, so a global cap is the same
 *   thing as an account cap; it can be used to lock the operator out for one
 *   window, and that is a far better trade than unmetered guessing against a
 *   single password.
 */
async function recentFailures(ip: string): Promise<{ fromIp: number; total: number }> {
	const db = getDb();
	const since = new Date(Date.now() - windowMinutes() * 60_000);
	const rows = await db
		.select({
			total: sql<number>`count(*)::int`,
			fromIp: sql<number>`count(*) FILTER (WHERE ${auditLogs.details}->>'ip' = ${ip})::int`
		})
		.from(auditLogs)
		.where(and(eq(auditLogs.action, 'admin.login_failed'), gt(auditLogs.createdAt, since)));
	return { fromIp: rows[0]?.fromIp ?? 0, total: rows[0]?.total ?? 0 };
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
 *
 * `ip` is what the caller claimed, not what was established. It is recorded so
 * support can see a pattern and is never on its own allowed to decide whether a
 * request proceeds — see `recentFailures`.
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

	const failures = await recentFailures(ip);
	if (failures.total >= maxAttemptsGlobal() || failures.fromIp >= maxAttempts()) {
		await record('admin.login_blocked', email, {
			ip,
			scope: failures.total >= maxAttemptsGlobal() ? 'global' : 'ip'
		});
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
