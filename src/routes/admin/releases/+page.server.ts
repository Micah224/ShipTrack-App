import type { PageServerLoad } from './$types';
import { listReleases } from '$lib/server/admin/queries';
import { latestRelease } from '$lib/server/domain/releases';

export const load: PageServerLoad = async () => {
	const [releases, latest] = await Promise.all([listReleases(), latestRelease()]);
	// The updater picks by version, not publish date, so the list's first row
	// is not necessarily what sites are offered.
	return { releases, latestId: latest?.id ?? null };
};
