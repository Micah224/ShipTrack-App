import type { AdminIdentity } from '$lib/server/admin/session';

declare global {
	namespace App {
		interface Locals {
			admin: AdminIdentity | null;
			/**
			 * The signed-in customer, identified only by licence id.
			 *
			 * Deliberately not the licence key or its hash: the session must not be
			 * replayable against the licence API, and a leaked cookie should expire
			 * on its own rather than hand over a credential that never does.
			 */
			portal: { licenseId: string } | null;
		}
	}
}

export {};
