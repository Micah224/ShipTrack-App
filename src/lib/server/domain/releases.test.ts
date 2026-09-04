import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer } from './releases';

describe('compareVersions', () => {
	it('compares numerically, not lexically', () => {
		// The case a string compare gets wrong, and the release nobody watches.
		expect(compareVersions('5.10.0', '5.9.0')).toBeGreaterThan(0);
		expect(compareVersions('5.9.0', '5.10.0')).toBeLessThan(0);
	});

	it('ignores a leading v', () => {
		expect(compareVersions('v5.1.0', '5.1.0')).toBe(0);
	});

	it('sorts a prerelease below its release', () => {
		expect(compareVersions('5.1.0-beta.1', '5.1.0')).toBeLessThan(0);
		expect(compareVersions('5.1.0', '5.1.0-beta.1')).toBeGreaterThan(0);
	});

	it('treats a missing segment as zero', () => {
		expect(compareVersions('5.1', '5.1.0')).toBe(0);
		expect(compareVersions('5.1.1', '5.1')).toBeGreaterThan(0);
	});
});

describe('isNewer', () => {
	it('is false for the same version, so no update is offered', () => {
		expect(isNewer('5.0.0', '5.0.0')).toBe(false);
	});

	it('is false when the site is somehow ahead of the server', () => {
		expect(isNewer('5.0.0', '5.1.0')).toBe(false);
	});

	it('is true for a genuine upgrade', () => {
		expect(isNewer('5.1.0', '5.0.0')).toBe(true);
	});
});
