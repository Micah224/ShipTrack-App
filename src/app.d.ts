import type { AdminIdentity } from '$lib/server/admin/session';

declare global {
	namespace App {
		interface Locals {
			admin: AdminIdentity | null;
		}
	}
}

export {};
