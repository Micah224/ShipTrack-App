import { redirect, type Handle } from '@sveltejs/kit';
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
