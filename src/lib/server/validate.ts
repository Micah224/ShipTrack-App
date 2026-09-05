/*
 * Request-body validation.
 *
 * These endpoints are unauthenticated and reachable by anyone, so a body is
 * arbitrary JSON until proven otherwise. Checking only for truthiness let a
 * numeric `key` through to `String.prototype.trim`, turning a malformed request
 * into a 500 — which is both a worse answer than a 400 and a free way to
 * generate error noise.
 */

export class InvalidField extends Error {
	constructor(public readonly field: string, message: string) {
		super(message);
	}
}

export function str(body: unknown, field: string, { max = 2048 } = {}): string {
	const value = (body as Record<string, unknown> | null | undefined)?.[field];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new InvalidField(field, `${field} must be a non-empty string.`);
	}
	if (value.length > max) {
		throw new InvalidField(field, `${field} must be at most ${max} characters.`);
	}
	return value;
}

export function optionalStr(
	body: unknown,
	field: string,
	{ max = 2048 } = {}
): string | null {
	const value = (body as Record<string, unknown> | null | undefined)?.[field];
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string') {
		throw new InvalidField(field, `${field} must be a string when present.`);
	}
	if (value.length > max) {
		throw new InvalidField(field, `${field} must be at most ${max} characters.`);
	}
	return value;
}

export function optionalStrArray(
	body: unknown,
	field: string,
	{ max = 32, itemMax = 64 } = {}
): string[] {
	const value = (body as Record<string, unknown> | null | undefined)?.[field];
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new InvalidField(field, `${field} must be an array of strings.`);
	}
	/*
	 * Both dimensions are bounded, because bounding only the count does not
	 * bound the blob. This previously capped the array at 32 entries and said in
	 * a comment that it prevented "an unbounded blob per activation" — while
	 * placing no limit on entry length, so 32 x 100 KB sailed through into a
	 * jsonb column with no size constraint. Measured: one activation row of
	 * 3,200,132 bytes.
	 *
	 * These are transport-mode identifiers ('road', 'rail'), so 64 characters is
	 * already generous; a caller sending more is not describing transport modes.
	 */
	const items = value.slice(0, max) as string[];
	const oversized = items.findIndex((item) => item.length > itemMax);
	if (oversized !== -1) {
		throw new InvalidField(
			field,
			`${field}[${oversized}] must be at most ${itemMax} characters.`
		);
	}
	return items;
}
