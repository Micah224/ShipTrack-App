import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { readSession, SESSION_COOKIE } from '$lib/server/admin/jwt';
import { readPortalSession, PORTAL_COOKIE } from '$lib/server/portal/session';

const LOGIN_PATH = '/admin/login';
const PORTAL_ROOT = '/portal';
/* The sign-in form itself, and the logout action, must stay reachable. */
const PORTAL_OPEN = new Set([PORTAL_ROOT, '/portal/logout']);

/**
 * Guards the admin console.
 *
 * Deny-by-default: everything under /admin requires a valid session except the
 * login page itself. Written as a prefix check rather than per-route guards
 * because a new admin page must be protected by existing, not by remembering
 * to add a guard to it.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const isAdminRoute = event.url.pathname.startsWith('/admin');

	if (isAdminRoute) {
		const claims = readSession(event.cookies.get(SESSION_COOKIE));
		event.locals.admin = claims ? { email: claims.sub } : null;

		if (!event.locals.admin && event.url.pathname !== LOGIN_PATH) {
			// Carry the destination so a bookmarked deep link survives login.
			const next = encodeURIComponent(event.url.pathname + event.url.search);
			redirect(303, `${LOGIN_PATH}?next=${next}`);
		}

		if (event.locals.admin && event.url.pathname === LOGIN_PATH) {
			redirect(303, '/admin');
		}
	}

	/*
	 * The customer portal, guarded the same way and for the same reason: a prefix
	 * check, so a page added under /portal later is protected by existing rather
	 * than by someone remembering to guard it.
	 *
	 * Signed in with the licence key, so the session names a licence id and
	 * nothing else — see portal/session.ts for why that is not the key itself.
	 */
	if (event.url.pathname.startsWith(PORTAL_ROOT)) {
		const claims = readPortalSession(event.cookies.get(PORTAL_COOKIE));
		event.locals.portal = claims ? { licenseId: claims.sub } : null;

		if (!event.locals.portal && !PORTAL_OPEN.has(event.url.pathname)) {
			const next = encodeURIComponent(event.url.pathname + event.url.search);
			redirect(303, `${PORTAL_ROOT}?next=${next}`);
		}
	}

	return resolve(event);
};

/**
 * Logs the whole cause chain, not just the outermost error.
 *
 * Drizzle wraps every failure as `Failed query: <sql>`, and the reason it
 * failed — `password authentication failed`, `relation does not exist`, a
 * fetch that never left the function — lives in `error.cause`. SvelteKit's
 * default handler logs the error object, and Vercel's log viewer renders its
 * message and stack and nothing else, so the cause is never written down
 * anywhere.
 *
 * That is not a cosmetic gap. A release that uploaded to R2 and then died on
 * the insert produced a 500 indistinguishable from a 500 caused by a stale
 * connection string, and the difference between those two — which is the whole
 * diagnosis — was the one field being dropped.
 *
 * The response body is unchanged: `message` is SvelteKit's own generic text,
 * and the detail belongs in the log, not in an answer to an untrusted caller.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const chain: string[] = [];
	let current: unknown = error;
	// Bounded rather than while-truthy: `cause` can be made to point at itself.
	for (let depth = 0; current instanceof Error && depth < 5; depth += 1) {
		chain.push(`${current.name}: ${current.message}`);
		current = current.cause;
	}
	if (chain.length === 0) chain.push(String(error));

	const detail = chain
		.map((line, index) => (index === 0 ? line : `${'  '.repeat(index)}caused by ${line}`))
		.join('\n');

	console.error(
		`[${status}] ${event.request.method} ${event.url.pathname}\n${detail}`,
		error instanceof Error ? error.stack : ''
	);

	return { message };
};
