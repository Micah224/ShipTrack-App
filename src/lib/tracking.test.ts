import { describe, expect, it } from 'vitest';
import { checkPair, verify, withCheck } from './tracking';

/*
 * Every expected value here was produced by the plugin's own PHP class
 * (TrackingNumberService::checksum / hasValidChecksum, ShipTrack-Pro), not by
 * this port. If the port drifts, these fail -- which is the point: the landing
 * page demonstrates the plugin, so it must agree with the plugin.
 */
describe('checkPair matches the plugin', () => {
	it.each([
		['USA-NYC-20260702-000483', 'U4'],
		['GBR-LDN-20260928-000483', 'A6'],
		['GBR-LDN-20260928-000001', 'UN'],
		['DEU-HAM-20261231-999999', 'LF'],
		['CMR-DLA-20260101-000042', '1L'],
		['NGA-LOS-20260315-120034', 'E5'],
		['AUS-SYD-20260704-000007', 'KY'],
		['A-B-00000000-000000', '4X']
	])('%s -> %s', (payload, pair) => {
		expect(checkPair(payload)).toBe(pair);
	});
});

describe('verify agrees with hasValidChecksum', () => {
	const good = 'GBR-LDN-20260928-000483-A6';

	it('accepts a valid number, in any case, with surrounding space', () => {
		expect(verify(good).state).toBe('valid');
		expect(verify(good.toLowerCase()).state).toBe('valid');
		expect(verify(` ${good} `).state).toBe('valid');
	});

	it('catches a transposition, the commonest human error', () => {
		expect(verify('GBR-LDN-20260928-000438-A6')).toEqual({
			state: 'mismatch',
			payload: 'GBR-LDN-20260928-000438',
			typed: 'A6',
			expected: checkPair('GBR-LDN-20260928-000438')
		});
	});

	it('catches a single-digit change', () => {
		expect(verify('GBR-LDN-20260928-000484-A6').state).toBe('mismatch');
	});

	it('rejects the wrong shape before computing anything', () => {
		expect(verify('GBR-LDN-2026092-000483-A6').state).toBe('malformed');
		expect(verify('GBR-LDN-20260928-000483-A').state).toBe('malformed');
		expect(verify('').state).toBe('malformed');
	});

	/*
	 * Normalised the way PHP does it, not the way JavaScript does: verdicts
	 * below are hasValidChecksum's own, run against the plugin class.
	 */
	it('trims and upper-cases exactly as PHP trim() and strtoupper() do', () => {
		// Only PHP's default trim list is stripped, NUL and vertical tab included.
		expect(verify(`${good}\0`).state).toBe('valid');
		expect(verify(` \t${good}\n\x0B`).state).toBe('valid');
		// A pasted non-breaking space or byte-order mark is not whitespace to PHP.
		expect(verify(`${good}\u00A0`).state).toBe('malformed');
		expect(verify(`\uFEFF${good}`).state).toBe('malformed');
		// Only ASCII a-z is upper-cased: a dotless i does not become an I.
		expect(verify(`\u0131${good.slice(1)}`).state).toBe('malformed');
		// And a full-width digit is not a digit.
		expect(verify('GBR-LDN-2026092\uFF18-000483-A6').state).toBe('malformed');
	});

	it('withCheck round-trips through verify', () => {
		expect(withCheck('GBR-LDN-20260928-000483')).toBe(good);
		expect(verify(withCheck('CMR-DLA-20260101-000042')).state).toBe('valid');
	});
});
