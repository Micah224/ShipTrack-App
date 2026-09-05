import { json } from '@sveltejs/kit';
import type { LicenseRefusal } from './domain/licenses.ts';
import type { LimitOutcome } from './domain/limits.ts';

/** Machine-readable refusals. The plugin branches on `code`, never on prose. */
export function fail(refusalOrCode: LicenseRefusal | string, message?: string, status = 400) {
	if (typeof refusalOrCode === 'string') {
		return json({ ok: false, code: refusalOrCode, message: message ?? refusalOrCode }, { status });
	}
	return json(
		{ ok: false, code: refusalOrCode.code, message: refusalOrCode.message },
		{ status: refusalOrCode.status }
	);
}

export function ok<T extends Record<string, unknown>>(
	body: T,
	status = 200,
	headers: Record<string, string> = {}
) {
	return json({ ok: true, ...body }, { status, headers });
}

export async function readJson<T>(request: Request): Promise<T | null> {
	try {
		return (await request.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Best-effort client IP.
 *
 * Recorded for support ("which server is this activation coming from"), never
 * for authorisation — it is trivially spoofable and behind Vercel it is the
 * edge's view of the caller, not necessarily the WordPress host itself.
 */
export function clientIp(request: Request): string | null {
	const forwarded = request.headers.get('x-forwarded-for');
	const value = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip');
	/*
	 * Capped because this is the only caller-supplied value in these handlers
	 * that does not pass through `str(body, …, { max })`, and it is written to
	 * `activations.ip_address` — an unbounded text column on a five-index table
	 * — on every activate and every heartbeat. 45 characters is a full IPv6
	 * address with a zone id; anything longer is not an address.
	 */
	return value === null ? null : value.slice(0, 45);
}

/** Longest a bucket has to wait, and how close every bucket is to its limit. */
export function rateLimitHeaders(outcome: LimitOutcome): Record<string, string> {
	if (outcome.all.length === 0) return {};
	/*
	 * Report the bucket with the least headroom, so an integrator watching these
	 * sees the one that will actually refuse them first. Sent on every response,
	 * not only on 429s: three cheap headers turn "is this customer near a limit?"
	 * into a curl rather than a database query.
	 */
	const tightest = outcome.all.reduce((a, b) =>
		a.limit - a.hits <= b.limit - b.hits ? a : b
	);
	return {
		'RateLimit-Limit': String(tightest.limit),
		'RateLimit-Remaining': String(Math.max(0, tightest.limit - tightest.hits)),
		'RateLimit-Reset': String(tightest.retryAfter)
	};
}

/**
 * The 429.
 *
 * `Retry-After` is integer seconds, never an HTTP-date: WordPress hosts drift,
 * and a date is a second clock to disagree about. The value came back from the
 * same statement that incremented the counter, computed by Postgres from the
 * same `now()`, so the header cannot disagree with the row that produced it.
 *
 * Two message shapes. A caller whose licence resolved gets a specific sentence
 * they can act on. A caller whose key did not resolve gets a generic one —
 * naming the bucket would tell an enumerator that a global miss gate exists and
 * roughly where it sits.
 */
export function limited(outcome: LimitOutcome, message: string) {
	const retryAfter = outcome.worst?.retryAfter ?? 60;
	return json(
		{ ok: false, code: 'rate_limited', message, retry_after: retryAfter },
		{
			status: 429,
			headers: {
				'Retry-After': String(retryAfter),
				...rateLimitHeaders(outcome),
				/* So no proxy in front of a customer's host caches the refusal past its window. */
				'Cache-Control': 'no-store'
			}
		}
	);
}
