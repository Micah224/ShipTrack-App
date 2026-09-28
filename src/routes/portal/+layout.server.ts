import type { LayoutServerLoad } from './$types';
import { supportEmail } from '$lib/server/support';

/*
 * What the portal's shell needs on every page: whether to offer Sign out, and
 * where a customer can write for help. `signedIn` comes from the session the
 * hook verified, never from the request.
 */
export const load: LayoutServerLoad = ({ locals }) => ({
	signedIn: Boolean(locals.portal),
	supportEmail: supportEmail()
});
