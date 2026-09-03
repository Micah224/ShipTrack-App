import { json } from '@sveltejs/kit';
import type { LicenseRefusal } from './domain/licenses';

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

export function ok<T extends Record<string, unknown>>(body: T, status = 200) {
	return json({ ok: true, ...body }, { status });
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
	if (forwarded) return forwarded.split(',')[0].trim();
	return request.headers.get('x-real-ip');
}
