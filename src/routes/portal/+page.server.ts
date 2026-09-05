import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit, findLicenseByKey, licenseState } from '$lib/server/domain/licenses';
import { meterLicense, meterMiss } from '$lib/server/domain/limits';
import { issuePortalSession, PORTAL_COOKIE, portalTtlSeconds } from '$lib/server/portal/session';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.portal) redirect(303, '/portal/licence');
	return { next: url.searchParams.get('next') ?? null };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '').trim();

		if (!key) {
			return fail(400, { message: 'Enter your licence key.' });
		}

		const license = await findLicenseByKey(key);

		if (!license) {
			/*
			 * Metered on the miss path, exactly as /api/v1/activate is. This form is
			 * an unauthenticated guessing surface on the same credential, so leaving
			 * it unmetered would put a door next to the one that is locked.
			 */
			const missed = await meterMiss();
			if (missed.limited) {
				return fail(429, { message: 'Too many attempts. Try again in a few minutes.' });
			}
			return fail(404, { message: 'That licence key was not recognised.' });
		}

		const rate = await meterLicense('deactivate', license);
		if (rate.limited) {
			return fail(429, { message: 'Too many attempts. Try again in a few minutes.' });
		}

		/*
		 * A revoked or suspended licence still signs in. The portal is where a
		 * customer finds out WHY their sites stopped working, so locking them out
		 * of it at exactly that moment would send them to support to be told
		 * something the page could have shown them.
		 */
		const state = licenseState(license);

		cookies.set(PORTAL_COOKIE, issuePortalSession(license.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: url.protocol === 'https:',
			maxAge: portalTtlSeconds()
		});

		await audit('portal.signin', license.keyPrefix, license.id, { state });

		const next = String(form.get('next') ?? '');
		// Only same-origin paths: an attacker-supplied `next` is an open redirect.
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/portal/licence');
	}
};
