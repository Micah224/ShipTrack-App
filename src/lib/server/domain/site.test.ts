import { describe, expect, it } from 'vitest';
import { classifySite, normalizeDomain } from './site.ts';

describe('normalizeDomain', () => {
	it('reduces a full URL to its host', () => {
		expect(normalizeDomain('https://logistics.example.com/wp/')).toBe('logistics.example.com');
	});

	it('strips www, ports, case and trailing dots', () => {
		expect(normalizeDomain('HTTPS://WWW.Example.COM:8443/')).toBe('example.com');
		expect(normalizeDomain('example.com.')).toBe('example.com');
	});

	it('accepts a bare host', () => {
		expect(normalizeDomain('shop.example.co.uk')).toBe('shop.example.co.uk');
	});

	it('returns empty for empty input rather than throwing', () => {
		expect(normalizeDomain('   ')).toBe('');
	});
});

describe('classifySite', () => {
	it('counts a plain production domain', () => {
		expect(classifySite('https://logistics.example.com')).toEqual({
			domain: 'logistics.example.com',
			environment: 'PRODUCTION',
			countsSeat: true
		});
	});

	it.each([
		'http://mysite.local',
		'https://acme.test',
		'http://localhost',
		'http://127.0.0.1',
		'http://192.168.1.20',
		'http://10.0.0.5',
		'http://172.20.4.9'
	])('whitelists %s as local', (url) => {
		const site = classifySite(url);
		expect(site.environment).toBe('LOCAL');
		expect(site.countsSeat).toBe(false);
	});

	it.each(['https://staging.example.com', 'https://dev.example.com', 'https://stage.example.com'])(
		'whitelists %s as staging',
		(url) => {
			const site = classifySite(url);
			expect(site.environment).toBe('STAGING');
			expect(site.countsSeat).toBe(false);
		}
	);

	it.each([
		'https://acme.wpengine.com',
		'https://acme.kinsta.cloud',
		'https://live-acme.pantheonsite.io'
	])('whitelists managed host %s', (url) => {
		expect(classifySite(url).countsSeat).toBe(false);
	});

	it('does not mistake a public IP for a private one', () => {
		expect(classifySite('http://172.32.0.1').environment).toBe('PRODUCTION');
		expect(classifySite('http://11.0.0.1').environment).toBe('PRODUCTION');
	});

	it('does not whitelist a domain that merely contains a staging word', () => {
		expect(classifySite('https://staging-example.com').environment).toBe('PRODUCTION');
		expect(classifySite('https://example.com/staging').environment).toBe('PRODUCTION');
	});
});

describe('normalizeDomain rejects things that are not hosts', () => {
	/*
	 * Each of these was accepted before, because the regex fallback returns its
	 * input verbatim when there is no scheme, slash or colon. `classifySite`
	 * then reported PRODUCTION/countsSeat, so a valid key could burn a real seat
	 * against a string like "not a url" and have it signed into the token's
	 * domain claim.
	 */
	it.each([
		['a space-separated phrase', 'not a url'],
		['several words', 'a b c'],
		['an underscore host', 'not_a_host'],
		['a bare scheme', 'javascript:alert(1)'],
		['an empty host', 'http://'],
		['a trailing-hyphen label', 'bad-.example.com'],
		['a leading-hyphen label', '-bad.example.com'],
		['a label over 63 characters', `${'a'.repeat(64)}.example.com`],
		['a host over 253 characters', `${'a.'.repeat(200)}example.com`],
		['a quoted string', '"example.com"'],
		['a path only', '/wp-admin'],
		['a single label that is not localhost', 'wordpress']
	])('refuses %s', (_label, input) => {
		expect(normalizeDomain(input)).toBe('');
		expect(classifySite(input).domain).toBe('');
	});

	it('still accepts the forms real sites send', () => {
		expect(normalizeDomain('https://example.com/')).toBe('example.com');
		expect(normalizeDomain('example.com')).toBe('example.com');
		expect(normalizeDomain('https://WWW.Example.COM.')).toBe('example.com');
		expect(normalizeDomain('https://sub.example.co.uk:8443/path')).toBe('sub.example.co.uk');
		expect(normalizeDomain('192.168.1.10')).toBe('192.168.1.10');
		// Punycoded on the way in, which is what makes the domain the server binds
		// equal to the one TokenVerifier::normalizeHost computes plugin-side.
		expect(normalizeDomain('münchen-logistik.de')).toBe('xn--mnchen-logistik-zvb.de');
		expect(normalizeDomain('xn--mnchen-logistik-zvb.de')).toBe('xn--mnchen-logistik-zvb.de');
		expect(normalizeDomain('localhost')).toBe('localhost');
	});

	it('does not silently turn a scheme-relative URL into its host', () => {
		// `//evil.com` used to normalise to `evil.com`; it is not a site URL.
		expect(normalizeDomain('//evil.com')).toBe('evil.com');
	});
});
