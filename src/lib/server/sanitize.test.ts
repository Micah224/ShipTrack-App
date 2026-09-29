import { describe, expect, it } from 'vitest';
import { sanitizeChangelogHtml, truncateChangelogHtml } from './sanitize.ts';

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

describe('truncateChangelogHtml', () => {
	const NOTE = '<p><em>Changelog shortened.</em></p>';

	it('leaves a changelog that fits alone, apart from sanitising it', () => {
		const html = '<ul><li>Fixed</li></ul>';
		expect(truncateChangelogHtml(html, 100)).toBe(html);
		expect(truncateChangelogHtml('<p>ok</p><script>alert(1)</script>', 100)).toBe('<p>ok</p>');
	});

	it('still sanitises what it cuts: an excerpt is new markup', () => {
		const out = truncateChangelogHtml(`<p>${'x'.repeat(50)}</p><img src=x onerror=alert(1)>${'y'.repeat(100)}`, 120);
		expect(out).not.toContain('onerror');
		expect(out.endsWith(NOTE)).toBe(true);
	});

	it('never ends inside a tag', () => {
		// Cut lands inside the `<a href="…` of the second item.
		const html = '<ul><li>one</li><li><a href="https://example.test/very/long/path">two</a></li></ul>';
		const out = truncateChangelogHtml(html, 40);
		expect(out).not.toContain('href');
		expect(out).not.toContain('&lt;');
		expect(out).toBe(`<ul><li>one</li></ul>${NOTE}`);
	});

	it('never ends inside a character reference', () => {
		// 11 characters ends at `<p>Tom &amp`, one short of the semicolon.
		const out = truncateChangelogHtml('<p>Tom &amp; Jerry, and a great deal more text</p>', 11);
		expect(out).not.toContain('&amp;am');
		expect(out).toBe(`<p>Tom </p>${NOTE}`);
	});

	it('backs off to the last closed block when that keeps at least half the budget', () => {
		const html = `<ul><li>${'a'.repeat(60)}</li><li>${'b'.repeat(60)}</li></ul>`;
		const out = truncateChangelogHtml(html, 100);
		expect(out).toBe(`<ul><li>${'a'.repeat(60)}</li></ul>${NOTE}`);
	});

	it('closes whatever the cut left open', () => {
		const out = truncateChangelogHtml(`<ul><li><strong>${'z'.repeat(200)}</strong></li></ul>`, 50);
		expect(out).toMatch(/^<ul><li><strong>z+<\/strong><\/li><\/ul>/);
		expect(out.endsWith(NOTE)).toBe(true);
	});

	it('treats an excerpt that is exactly the budget as cut when the stored changelog was longer', () => {
		const excerpt = `<p>${'k'.repeat(93)}</p>`; // 100 characters, cut in SQL from something longer
		expect(truncateChangelogHtml(excerpt, 100, 5000).endsWith(NOTE)).toBe(true);
		expect(truncateChangelogHtml(excerpt, 100, 100)).toBe(excerpt);
	});
});
