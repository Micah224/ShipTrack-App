import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listActivations } from '$lib/server/admin/queries';
import { auditAdmin } from '$lib/server/admin/session';
import { releaseSeat } from '$lib/server/domain/seats';

export const load: PageServerLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	return { activations: await listActivations(search), search };
};

export const actions: Actions = {
	unbind: async ({ request, locals }) => {
		const form = await request.formData();
		const licenseId = String(form.get('licenseId') ?? '');
		const installId = String(form.get('installId') ?? '');

		if (!licenseId || !installId) return fail(400, { message: 'Missing licence or install id.' });

		// Reuses the same release path the plugin's own deactivate call takes,
		// so a remote unbind and a self-service one leave identical state --
		// only the recorded reason differs.
		const released = await releaseSeat(licenseId, installId, 'ADMIN');
		if (!released) return fail(409, { message: 'That install was already released.' });

		await auditAdmin('admin.seat_unbound', locals.admin?.email ?? 'unknown-admin', licenseId, {
			install_id: installId,
			domain: released.domain
		});

		return { message: `Released ${released.domain}.` };
	}
};
