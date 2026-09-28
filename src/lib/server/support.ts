import { optional } from './env.ts';

/*
 * Where customers write for help. Configuration, not copy: an address typed
 * into a page would be one nobody reads. Anything that is not plainly an
 * address is treated as unset, so a typo cannot publish a broken mailto link.
 *
 * Shared by the landing page and the licence portal, which both answer "I have
 * lost my key" and must point at the same place.
 */
export function supportEmail(): string | null {
	const value = optional('SUPPORT_EMAIL').trim();
	// Every domain label non-empty: help@example..com would be an undeliverable link.
	return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value) ? value : null;
}
