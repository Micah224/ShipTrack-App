import sanitizeHtml from 'sanitize-html';

/*
 * Changelog markdown becomes HTML that WordPress renders inside wp-admin, in
 * the plugin-information modal, on every licensed site.
 *
 * marked does not escape raw HTML — its `sanitize` option was removed years ago
 * — so an `<img src=x onerror=...>` in a release body would execute with an
 * administrator's session on every customer install. The release body is
 * trusted-ish (it comes from our own repository) but "trusted-ish" is not a
 * security boundary: a compromised token, or a maintainer pasting from
 * somewhere, is all it takes.
 *
 * The allowlist is what a changelog actually needs and nothing more.
 */
const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'p', 'br', 'hr',
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'ul', 'ol', 'li',
		'strong', 'b', 'em', 'i', 'del', 's',
		'code', 'pre', 'blockquote',
		'a',
		'table', 'thead', 'tbody', 'tr', 'th', 'td'
	],
	allowedAttributes: {
		// rel and target are listed because transformTags below adds them, and
		// the allowlist is applied after the transform -- omit them and the
		// hardening is silently stripped straight back off.
		a: ['href', 'title', 'rel', 'target']
	},
	// No javascript: or data: URLs, which are the way an anchor becomes a payload.
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesAppliedToAttributes: ['href'],
	disallowedTagsMode: 'discard',
	transformTags: {
		// Anything rendered in someone else's admin should not be able to
		// navigate that window or leak a referrer.
		a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
	}
};

export function sanitizeChangelogHtml(html: string): string {
	return sanitizeHtml(html, OPTIONS);
}

const SHORTENED_NOTE = '<p><em>Changelog shortened.</em></p>';

/* The closing tags a cut may end on without leaving a half-finished block. */
const BLOCK_END = /<\/(?:p|li|ul|ol|h[1-6]|pre|blockquote|table)\s*>/gi;

/**
 * A changelog cut to at most `max` characters of input, still well-formed and
 * still sanitised, with a note saying it was cut.
 *
 * `fullLength` is the length of the whole stored changelog, for when `html` is
 * already an excerpt (the rollback list cuts in SQL): an excerpt exactly `max`
 * long is only complete if nothing followed it.
 *
 * Cutting HTML by length alone ends mid-tag (`<a href="https://…`) or
 * mid-reference (`&am`), so the cut backs off to before either, drops opening
 * tags left with no content, then backs off to the last closed block if that
 * keeps at least half the budget. What is left open — `<ul><li>` — is closed
 * by the sanitiser, which is why the result always goes through it: an
 * excerpt is new markup, and it is shown in wp-admin.
 */
export function truncateChangelogHtml(html: string, max: number, fullLength = html.length): string {
	if (html.length <= max && fullLength <= max) return sanitizeChangelogHtml(html);

	let cut = html.slice(0, max);

	const open = cut.lastIndexOf('<');
	if (open > cut.lastIndexOf('>')) cut = cut.slice(0, open);

	cut = cut.replace(/&#?[a-z0-9]*$/i, '');

	// Opening tags with nothing after them would only survive as empty elements.
	cut = cut.replace(/(?:<[a-z][a-z0-9]*(?:\s[^<>]*)?>\s*)+$/i, '');

	let blockEnd = -1;
	for (const match of cut.matchAll(BLOCK_END)) blockEnd = match.index + match[0].length;
	if (blockEnd >= max / 2) cut = cut.slice(0, blockEnd);

	return sanitizeChangelogHtml(cut) + SHORTENED_NOTE;
}
