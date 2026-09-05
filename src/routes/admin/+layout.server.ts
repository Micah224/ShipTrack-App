import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => ({
	admin: locals.admin,
	pathname: url.pathname
});
