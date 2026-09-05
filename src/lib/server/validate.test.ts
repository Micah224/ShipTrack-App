import { describe, expect, it } from 'vitest';
import { InvalidField, optionalStr, optionalStrArray, str } from './validate.ts';

describe('str', () => {
	it('accepts a normal string', () => {
		expect(str({ key: 'STP-ABCD' }, 'key')).toBe('STP-ABCD');
	});

	it('rejects a non-string rather than letting it reach String.prototype.trim', () => {
		// The 500 this prevents: a numeric key reached normalizeLicenseKey and
		// threw "input.trim is not a function" on an unauthenticated request.
		expect(() => str({ key: 12345 }, 'key')).toThrow(InvalidField);
		expect(() => str({ key: null }, 'key')).toThrow(InvalidField);
		expect(() => str({ key: { nested: true } }, 'key')).toThrow(InvalidField);
		expect(() => str({ key: ['a'] }, 'key')).toThrow(InvalidField);
	});

	it('rejects an absent or blank field', () => {
		expect(() => str({}, 'key')).toThrow(InvalidField);
		expect(() => str({ key: '   ' }, 'key')).toThrow(InvalidField);
	});

	it('rejects an over-long field', () => {
		expect(() => str({ key: 'x'.repeat(200) }, 'key', { max: 128 })).toThrow(InvalidField);
	});

	it('survives a null or undefined body', () => {
		expect(() => str(null, 'key')).toThrow(InvalidField);
		expect(() => str(undefined, 'key')).toThrow(InvalidField);
	});

	it('names the offending field, so the client can say which one', () => {
		try {
			str({ site_url: 7 }, 'site_url');
			expect.unreachable();
		} catch (error) {
			expect((error as InvalidField).field).toBe('site_url');
		}
	});
});

describe('optionalStr', () => {
	it('returns null for absent, null or empty', () => {
		expect(optionalStr({}, 'wp_version')).toBeNull();
		expect(optionalStr({ wp_version: null }, 'wp_version')).toBeNull();
		expect(optionalStr({ wp_version: '' }, 'wp_version')).toBeNull();
	});

	it('still rejects a present non-string', () => {
		expect(() => optionalStr({ wp_version: 6.5 }, 'wp_version')).toThrow(InvalidField);
	});
});

describe('optionalStrArray', () => {
	it('defaults to empty', () => {
		expect(optionalStrArray({}, 'transport_modes')).toEqual([]);
	});

	it('rejects a non-array and an array of non-strings', () => {
		expect(() => optionalStrArray({ transport_modes: 'truck' }, 'transport_modes')).toThrow(InvalidField);
		expect(() => optionalStrArray({ transport_modes: [1, 2] }, 'transport_modes')).toThrow(InvalidField);
	});

	it('bounds the array so a hostile client cannot store a blob', () => {
		const huge = Array.from({ length: 500 }, (_, i) => `mode-${i}`);
		expect(optionalStrArray({ transport_modes: huge }, 'transport_modes')).toHaveLength(32);
	});
});

describe('optionalStrArray bounds the blob, not just the count', () => {
	it('refuses an entry longer than itemMax', () => {
		const body = { modes: ['road', 'x'.repeat(65)] };
		expect(() => optionalStrArray(body, 'modes')).toThrow(InvalidField);
		expect(() => optionalStrArray(body, 'modes')).toThrow(/modes\[1\] must be at most 64/);
	});

	it('refuses the payload that measured 3.2 MB in one activation row', () => {
		// 32 entries is within the count cap, so only a per-entry bound stops this.
		const body = { modes: Array.from({ length: 32 }, () => 'r'.repeat(100_000)) };
		expect(() => optionalStrArray(body, 'modes')).toThrow(InvalidField);
	});

	it('still accepts real transport modes', () => {
		expect(optionalStrArray({ modes: ['road', 'rail', 'sea', 'air'] }, 'modes')).toEqual([
			'road',
			'rail',
			'sea',
			'air'
		]);
	});

	it('reports the index of the first oversized entry', () => {
		const body = { modes: ['road', 'rail', 'y'.repeat(100)] };
		expect(() => optionalStrArray(body, 'modes')).toThrow(/modes\[2\]/);
	});

	it('applies the count cap before the length check, as documented', () => {
		// The 33rd entry is sliced away, so its length is irrelevant.
		const body = { modes: [...Array.from({ length: 32 }, () => 'road'), 'z'.repeat(500)] };
		expect(optionalStrArray(body, 'modes')).toHaveLength(32);
	});
});
