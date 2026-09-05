export type Environment = 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | 'LOCAL';

export interface SiteIdentity {
	domain: string;
	environment: Environment;
	countsSeat: boolean;
}

/**
 * Reduces a site URL to the host a licence is bound to.
 *
 * Lowercased, `www.` stripped, port dropped, trailing dot removed. A bare host
 * is accepted as well as a full URL, because `home_url()` is not the only thing
 * that ever reaches this function.
 *
 * Returns '' for anything that is not a host, which is what the callers already
 * treat as "refuse this request". That empty return is load-bearing: the regex
 * fallback below returns its input verbatim for a string with no scheme, slash
 * or colon, so without the final shape check `classifySite('not a url')` yielded
 * `{domain: 'not a url', environment: 'PRODUCTION', countsSeat: true}` — a
 * production seat burned against a string that is not a host, written to
 * `activations.domain` and signed into the entitlement's `domain` claim.
 */
const HOST_SHAPE = /^(?:[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?)(?:\.[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?)*$/;

export function normalizeDomain(input: string): string {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed) return '';

	let host = trimmed;
	try {
		host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
	} catch {
		host = trimmed.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0];
	}

	host = host.replace(/\.$/, '').replace(/^www\./, '');

	if (!HOST_SHAPE.test(host) || host.length > 253) return '';

	/*
	 * A single label is not a site domain. Both parsers reach one from input
	 * that never named a host: `new URL('https:///wp-admin')` normalises the
	 * triple slash and reports the *path* as the hostname, and the regex
	 * fallback reduces `javascript:alert(1)` to `javascript`. Requiring a dot
	 * rejects both while keeping the two single-label forms that are real —
	 * `localhost` and a bare IP, which `classifySite` already recognises.
	 */
	if (!host.includes('.')) return host === 'localhost' ? host : '';

	return host;
}

const LOCAL_TLDS = ['.local', '.test', '.example', '.invalid', '.localhost'];
const STAGING_PREFIXES = ['staging.', 'dev.', 'test.', 'stage.', 'preview.'];
const MANAGED_HOSTS = ['.wpengine.com', '.kinsta.cloud', '.pantheonsite.io', '.wpenginepowered.com'];

function isPrivateIp(host: string): boolean {
	const octets = host.split('.');
	if (octets.length !== 4 || !octets.every((o) => /^\d{1,3}$/.test(o))) return false;
	const [a, b] = octets.map(Number);
	if (a === 127 || a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	return false;
}

/**
 * Classifies a normalised host per section 11 of the master plan.
 *
 * Everything that is not production is whitelisted and consumes no seat. This
 * is deliberate generosity: a developer who cannot run a staging copy without
 * burning the seat their live site needs will pirate the plugin rather than buy
 * a second licence, and we would have taught them to.
 */
export function classifySite(domain: string): SiteIdentity {
	const host = normalizeDomain(domain);

	if (host === 'localhost' || isPrivateIp(host) || LOCAL_TLDS.some((tld) => host.endsWith(tld))) {
		return { domain: host, environment: 'LOCAL', countsSeat: false };
	}

	if (MANAGED_HOSTS.some((suffix) => host.endsWith(suffix))) {
		return { domain: host, environment: 'DEVELOPMENT', countsSeat: false };
	}

	if (STAGING_PREFIXES.some((prefix) => host.startsWith(prefix))) {
		return { domain: host, environment: 'STAGING', countsSeat: false };
	}

	return { domain: host, environment: 'PRODUCTION', countsSeat: true };
}
