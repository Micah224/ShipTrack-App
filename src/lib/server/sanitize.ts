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
