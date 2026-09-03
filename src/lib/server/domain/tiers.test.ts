import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SEATS,
	TIER_FEATURES,
	TIER_LIMITS,
	effectiveFeatures,
	effectiveLimits,
	featuresForTier,
	limitsForTier
} from './tiers';

describe('tier feature matrix', () => {
	it('gates transport modes exactly as the commercial matrix says', () => {
		expect(TIER_FEATURES.STARTER).toEqual(expect.arrayContaining(['truck', 'plane']));
		expect(TIER_FEATURES.STARTER).not.toContain('train');
		expect(TIER_FEATURES.STARTER).not.toContain('ship');

		expect(TIER_FEATURES.PROFESSIONAL).toContain('train');
		expect(TIER_FEATURES.PROFESSIONAL).not.toContain('ship');

		expect(TIER_FEATURES.ENTERPRISE).toEqual(expect.arrayContaining(['train', 'ship']));
	});

	it('keeps Google Maps out of Starter', () => {
		expect(TIER_FEATURES.STARTER).not.toContain('google_maps');
		expect(TIER_FEATURES.PROFESSIONAL).toContain('google_maps');
	});

	it('gives every tier a strict superset of the one below', () => {
		for (const feature of TIER_FEATURES.STARTER) {
			expect(TIER_FEATURES.PROFESSIONAL).toContain(feature);
		}
		for (const feature of TIER_FEATURES.PROFESSIONAL) {
			expect(TIER_FEATURES.ENTERPRISE).toContain(feature);
		}
	});

	it('matches the documented seat counts', () => {
		expect(DEFAULT_SEATS.STARTER).toBe(1);
		expect(DEFAULT_SEATS.PROFESSIONAL).toBe(3);
	});
});

describe('tier limits', () => {
	it('expresses branch caps as numbers, not as cancelling feature flags', () => {
		expect(TIER_LIMITS.STARTER.branches).toBe(1);
		expect(TIER_LIMITS.PROFESSIONAL.branches).toBe(5);
		// null is unlimited, which is why it is not 0 and not Infinity.
		expect(TIER_LIMITS.ENTERPRISE.branches).toBeNull();
	});

	it('gives Professional a bounded retention and Enterprise an unbounded one', () => {
		expect(TIER_LIMITS.PROFESSIONAL.auditRetentionDays).toBe(90);
		expect(TIER_LIMITS.ENTERPRISE.auditRetentionDays).toBeNull();
	});

	it('falls back to Starter for an unknown tier', () => {
		expect(limitsForTier('NONSENSE' as never)).toEqual(TIER_LIMITS.STARTER);
	});
});

describe('effectiveFeatures', () => {
	it('falls back to the tier matrix when the licence stores none', () => {
		expect(effectiveFeatures({ tier: 'ENTERPRISE', features: [] })).toEqual(
			featuresForTier('ENTERPRISE')
		);
	});

	it('lets a bespoke licence override its tier', () => {
		expect(effectiveFeatures({ tier: 'STARTER', features: ['ship'] })).toEqual(['ship']);
	});
});


describe('effectiveFeatures with the database default', () => {
	// The regression this file previously missed: every test used `features: []`,
	// but no minted row ever held that. The column defaulted to
	// ['truck','plane'], effectiveFeatures preferred it over the tier, and every
	// licence above STARTER silently granted two features.
	it('derives from the tier when the column carries its default', () => {
		const DB_DEFAULT: string[] = [];
		expect(effectiveFeatures({ tier: 'ENTERPRISE', features: DB_DEFAULT })).toEqual(
			featuresForTier('ENTERPRISE')
		);
		expect(effectiveFeatures({ tier: 'ENTERPRISE', features: DB_DEFAULT })).toContain('ship');
		expect(effectiveFeatures({ tier: 'PROFESSIONAL', features: DB_DEFAULT })).toContain('train');
	});

	it('never silently reduces a paid tier to Starter capability', () => {
		for (const tier of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const) {
			const resolved = effectiveFeatures({ tier, features: [] });
			expect(resolved).toEqual(TIER_FEATURES[tier]);
		}
	});
});

describe('effectiveLimits', () => {
	it('falls back to the tier when no override is stored', () => {
		expect(effectiveLimits({ tier: 'PROFESSIONAL', limits: null })).toEqual(
			limitsForTier('PROFESSIONAL')
		);
	});

	it('honours a stored override, so a bespoke licence is not capped at its tier', () => {
		expect(
			effectiveLimits({ tier: 'STARTER', limits: { branches: null, auditRetentionDays: null } })
		).toEqual({ branches: null, auditRetentionDays: null });
	});

	it('fills a partially specified override from the tier', () => {
		expect(
			effectiveLimits({
				tier: 'PROFESSIONAL',
				limits: { branches: 25 } as { branches: number | null; auditRetentionDays: number | null }
			})
		).toEqual({ branches: 25, auditRetentionDays: 90 });
	});
});
