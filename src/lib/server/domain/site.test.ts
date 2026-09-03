import { describe, expect, it } from 'vitest';
import { classifySite, normalizeDomain } from './site';

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
