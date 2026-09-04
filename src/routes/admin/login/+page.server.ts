import { fail, redirect, type Actions } from '@sveltejs/kit';
import { attemptLogin } from '$lib/server/admin/session';
import { issueSession, SESSION_COOKIE, sessionTtlSeconds } from '$lib/server/admin/jwt';
import { clientIp } from '$lib/server/http';

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: 'Enter both an email address and a password.' });
		}

		const ip = clientIp(request) ?? getClientAddress();
		const result = await attemptLogin(email, password, ip);

		if (!result.ok) {
			const message =
				result.reason === 'rate_limited'
					? 'Too many failed attempts. Try again shortly.'
					: result.reason === 'not_configured'
						? 'No admin account is configured on this deployment.'
						: 'Those credentials were not recognised.';
			// 401 rather than 400: this is an authentication failure, and the
			// status is what a log or a WAF in front of this will key on.
			return fail(result.reason === 'rate_limited' ? 429 : 401, { email, message });
		}

		cookies.set(SESSION_COOKIE, issueSession(result.email), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: url.protocol === 'https:',
			maxAge: sessionTtlSeconds()
		});

		const next = url.searchParams.get('next');
		// Only ever redirect within this site: an attacker-supplied absolute URL
		// would turn the login form into an open redirect.
		redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
	}
};
