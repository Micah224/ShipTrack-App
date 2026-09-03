import type { PageServerLoad } from './$types';
import { listReleases } from '$lib/server/admin/queries';

export const load: PageServerLoad = async () => ({ releases: await listReleases() });
