import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { PORTAL_COOKIE } from '$lib/server/portal/session';

/*
 * POST only. A GET logout can be triggered by any image tag on any page, which
 * makes signing a customer out a cross-site request anyone can forge — harmless
 * on its own, and an easy way to make the portal look broken.
 */
export const actions: Actions = {
	default: ({ cookies }) => {
		cookies.delete(PORTAL_COOKIE, { path: '/' });
		redirect(303, '/portal');
	}
};
