import { describe, expect, it } from 'vitest';
import { timingSafeEqualString } from './compare';

describe('timingSafeEqualString', () => {
	it('matches identical strings', () => {
		expect(timingSafeEqualString('sha256=abc', 'sha256=abc')).toBe(true);
	});

	it('rejects different strings of the same length', () => {
		expect(timingSafeEqualString('sha256=abc', 'sha256=abd')).toBe(false);
	});

	it('returns false rather than throwing on a length mismatch', () => {
		// The trap this exists to remove: crypto.timingSafeEqual throws on
		// differing lengths, so a forged webhook signature of the wrong length
		// produced a 500 instead of a 401.
		expect(() => timingSafeEqualString('short', 'considerably longer value')).not.toThrow();
		expect(timingSafeEqualString('short', 'considerably longer value')).toBe(false);
	});

	it('handles empty input on either side', () => {
		expect(timingSafeEqualString('', 'Bearer secret')).toBe(false);
		expect(timingSafeEqualString('Bearer secret', '')).toBe(false);
		expect(timingSafeEqualString('', '')).toBe(true);
	});
});
