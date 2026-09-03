import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { sanitizeChangelogHtml } from './sanitize';

describe('sanitizeChangelogHtml', () => {
	it('strips the payload that would run in every customer wp-admin', async () => {
		// marked passes raw HTML straight through -- its `sanitize` option was
		// removed -- so without this the release body executed with an admin's
		// session on every licensed site.
		const html = await marked.parse('<img src=x onerror="alert(document.cookie)">');
		const clean = sanitizeChangelogHtml(html);
		expect(clean).not.toContain('onerror');
		expect(clean).not.toContain('<img');
	});

	it('strips script tags', async () => {
		const clean = sanitizeChangelogHtml(await marked.parse('<script>fetch("/steal")</script>'));
		expect(clean).not.toContain('<script');
		expect(clean).not.toContain('fetch(');
	});

	it('strips javascript: and data: URLs from links', () => {
		const clean = sanitizeChangelogHtml(
			'<a href="javascript:alert(1)">x</a><a href="data:text/html,<script>1</script>">y</a>'
		);
		expect(clean).not.toContain('javascript:');
		expect(clean).not.toContain('data:text/html');
	});

	it('strips event handlers from otherwise allowed tags', () => {
		const clean = sanitizeChangelogHtml('<p onclick="alert(1)">hello</p>');
		expect(clean).toContain('hello');
		expect(clean).not.toContain('onclick');
	});

	it('keeps the markup a changelog actually needs', async () => {
		const clean = sanitizeChangelogHtml(
			await marked.parse('## 5.1.0\n\n- **Added** rail routing\n- Fixed `Luhn` checksum\n')
		);
		expect(clean).toContain('<h2>');
		expect(clean).toContain('<strong>');
		expect(clean).toContain('<code>');
		expect(clean).toContain('<li>');
	});

	it('keeps http links but hardens them', () => {
		const clean = sanitizeChangelogHtml('<a href="https://example.com">docs</a>');
		expect(clean).toContain('href="https://example.com"');
		expect(clean).toContain('rel="noopener noreferrer"');
	});
});
