import type { PageServerLoad } from './$types';
import { dashboardStats } from '$lib/server/admin/queries';

export const load: PageServerLoad = async () => ({ stats: await dashboardStats() });
