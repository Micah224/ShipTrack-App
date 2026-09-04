import { redirect, type Handle } from '@sveltejs/kit';
import { readSession, SESSION_COOKIE } from '$lib/server/admin/jwt';

const LOGIN_PATH = '/admin/login';

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

	return resolve(event);
};
