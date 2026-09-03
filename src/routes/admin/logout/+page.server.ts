import { redirect, type Actions } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/admin/jwt';

export const actions: Actions = {
	// POST only. A GET logout can be triggered by any image tag on any page,
	// which is a nuisance rather than a breach, but a pointless one to allow.
	default: async ({ cookies, url }) => {
		// Same attributes the cookie was set with. Deletion matches on name, path
		// and domain, so this is belt and braces -- but a mismatch is the kind of
		// thing that leaves a session alive in one browser and not another.
		cookies.delete(SESSION_COOKIE, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: url.protocol === 'https:'
		});
		redirect(303, '/admin/login');
	}
};

export const load = () => {
	redirect(303, '/admin');
};
