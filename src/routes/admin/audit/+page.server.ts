import type { PageServerLoad } from './$types';
import { recentAudit } from '$lib/server/admin/session';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	// One row over the page size tells us whether a next page exists without a
	// second count query over a table that only ever grows.
	const rows = await recentAudit(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, search);

	return {
		entries: rows.slice(0, PAGE_SIZE),
		hasNext: rows.length > PAGE_SIZE,
		page,
		search
	};
};
