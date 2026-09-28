/*
 * The plugin's tracking-number check pair, ported for the marketing page.
 *
 * ShipTrack numbers are `{COUNTRY}-{BRANCH}-{YYYYMMDD}-{SEQ6}-{CHK2}`, and the
 * last two characters are a Luhn mod-36 check pair over everything before them
 * (`TrackingNumberService::checksum` in ShipTrack-Pro). The public lookup form
 * uses it to reject a mistyped number before the database is asked.
 *
 * This is a port, not a re-imagining: the landing page runs it live so a
 * visitor can watch a typo get caught, and a demo that disagreed with the
 * plugin would be demonstrating something the product does not do. The test
 * file pins it to vectors computed by the PHP class itself.
 */

const SHAPE = /^[A-Z0-9]+-[A-Z0-9]+-\d{8}-\d{6}-[A-Z0-9]{2}$/;

/*
 * PHP's trim() strips only its default list (space, tab, newline, carriage
 * return, NUL, vertical tab) and strtoupper() touches only ASCII a-z. The
 * JavaScript built-ins are Unicode-aware, so a number pasted with a trailing
 * non-breaking space, or typed with a dotless i, would pass here and fail in
 * the plugin. These two keep the port byte-for-byte with hasValidChecksum.
 */
const PHP_TRIM = new Set([' ', '\t', '\n', '\r', '\0', '\v']);

/** How many characters PHP's trim() would strip from the start of a value. */
export function leadingTrim(value: string): number {
	let start = 0;
	while (start < value.length && PHP_TRIM.has(value[start])) start++;
	return start;
}

/** Trims and upper-cases a typed number exactly as the plugin's PHP does. */
export function normalise(value: string): string {
	const start = leadingTrim(value);
	let end = value.length;
	while (end > start && PHP_TRIM.has(value[end - 1])) end--;
	return value.slice(start, end).replace(/[a-z]/g, (char) => char.toUpperCase());
}

/** '0'-'9' => 0..9, 'A'-'Z' => 10..35, anything else => 0, as in the plugin. */
function codePoint(char: string): number {
	const code = char.charCodeAt(0);
	if (code >= 48 && code <= 57) return code - 48;
	if (code >= 65 && code <= 90) return code - 65 + 10;
	return 0;
}

/** The inverse of codePoint: 0..9 => '0'-'9', 10..35 => 'A'-'Z'. */
function fromCodePoint(value: number): string {
	return value < 10 ? String.fromCharCode(value + 48) : String.fromCharCode(value - 10 + 65);
}

/** The single base-36 character that makes `input + char` validate. */
function luhnCheckChar(input: string): string {
	const n = 36;
	let factor = 2;
	let sum = 0;
	for (let i = input.length - 1; i >= 0; i--) {
		let addend = factor * codePoint(input[i]);
		factor = factor === 2 ? 1 : 2;
		addend = Math.floor(addend / n) + (addend % n);
		sum += addend;
	}
	return fromCodePoint((n - (sum % n)) % n);
}

/** The two-character check pair for the segments preceding it. */
export function checkPair(payload: string): string {
	const alnum = payload
		.replace(/[^A-Za-z0-9]/g, '')
		.replace(/[a-z]/g, (char) => char.toUpperCase());
	const c1 = luhnCheckChar(alnum);
	return c1 + luhnCheckChar(alnum + c1);
}

export type Verdict =
	| { state: 'valid'; payload: string; check: string }
	| { state: 'mismatch'; payload: string; typed: string; expected: string }
	| { state: 'malformed' };

/**
 * What the public lookup would decide about a whole number.
 *
 * Mirrors `hasValidChecksum`: trimmed, upper-cased, shape-checked, then the
 * trailing pair compared against the recomputed one. It additionally reports
 * the expected pair on a mismatch, which the plugin keeps to itself and the
 * demo shows, because that is the part a visitor finds convincing.
 */
export function verify(trackingNumber: string): Verdict {
	const tn = normalise(trackingNumber);
	if (!SHAPE.test(tn)) return { state: 'malformed' };

	const cut = tn.lastIndexOf('-');
	const payload = tn.slice(0, cut);
	const typed = tn.slice(cut + 1);
	const expected = checkPair(payload);

	return typed === expected
		? { state: 'valid', payload, check: typed }
		: { state: 'mismatch', payload, typed, expected };
}

/** A complete, valid number for a payload. */
export function withCheck(payload: string): string {
	return `${payload}-${checkPair(payload)}`;
}
