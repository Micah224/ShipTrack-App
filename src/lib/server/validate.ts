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

export function optionalStrArray(body: unknown, field: string, { max = 32 } = {}): string[] {
	const value = (body as Record<string, unknown> | null | undefined)?.[field];
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new InvalidField(field, `${field} must be an array of strings.`);
	}
	// Bounded so a hostile client cannot store an unbounded blob per activation.
	return value.slice(0, max) as string[];
}
