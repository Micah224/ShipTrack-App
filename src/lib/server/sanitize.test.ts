import { describe, expect, it } from 'vitest';
import { sanitizeChangelogHtml } from './sanitize.ts';

/*
 * The changelog is rendered inside wp-admin on every licensed site, so a bypass
 * here executes with an administrator's session on customer installs.
 *
 * These test the vectors rather than the configuration: asserting that
 * `allowedTags` contains what we wrote would pass just as happily against a
 * parser that never applied it.
 */
describe('sanitizeChangelogHtml', () => {
	it.each([
		['script tag', '<p>ok</p><script>alert(1)</script>', '<script'],
		['img onerror', '<img src=x onerror=alert(1)>', 'onerror'],
		['svg onload', '<svg onload=alert(1)>', 'onload'],
		['iframe', '<iframe src="https://evil.test"></iframe>', '<iframe'],
		['style attribute', '<p style="background:url(javascript:alert(1))">x</p>', 'style'],
		['plain javascript: href', '<a href="javascript:alert(1)">x</a>', 'javascript'],
		['data: href', '<a href="data:text/html,x">x</a>', 'data:'],
		['decimal entity javascript:', '<a href="&#106;avascript:alert(1)">x</a>', 'javascript'],
		['hex entity javascript:', '<a href="&#x6a;avascript:alert(1)">x</a>', 'javascript'],
		/*
		 * The zero-padded form is the one htmlparser2 8.x decoded incorrectly, letting
		 * it slip past javascript: detection. sanitize-html 2.17.5 fixed it by moving
		 * to htmlparser2 10.1.0 -- which is also the last line that still ships a
		 * CommonJS build, and therefore the version `overrides` pins us to. This case
		 * is what proves that pin kept the fix rather than only the compatibility.
		 */
		['zero-padded numeric ref', '<a href="&#0000106avascript:alert(1)">x</a>', 'javascript']
	])('strips %s', (_label, input, forbidden) => {
		expect(sanitizeChangelogHtml(input).toLowerCase()).not.toContain(forbidden.toLowerCase());
	});

	it('keeps the markup a changelog actually needs', () => {
		const out = sanitizeChangelogHtml(
			'<h2>1.2.0</h2><ul><li><strong>Fixed</strong> <code>x</code></li></ul>'
		);
		expect(out).toContain('<h2>1.2.0</h2>');
		expect(out).toContain('<strong>Fixed</strong>');
		expect(out).toContain('<code>x</code>');
	});

	it('hardens links rather than dropping them', () => {
		const out = sanitizeChangelogHtml('<a href="https://example.test">release</a>');
		expect(out).toContain('href="https://example.test"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('target="_blank"');
	});

	it('returns a string for malformed input rather than throwing', () => {
		expect(typeof sanitizeChangelogHtml('<hello')).toBe('string');
		expect(typeof sanitizeChangelogHtml('')).toBe('string');
	});
});
