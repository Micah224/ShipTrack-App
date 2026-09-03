import type { License } from '../db/schema';

export type Tier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

/*
 * The commercial matrix from section 3, split into two kinds of claim.
 *
 * `features` are additive capability flags — each tier is a strict superset of
 * the one below, which is what lets the plugin ask "can this site do X?" and
 * get a stable answer. Numeric caps are NOT expressed as flags: a tier that
 * granted `branch_single` and another that granted `branch_multi_5` would break
 * the superset property and force the plugin to know which flags cancel which.
 * Caps live in `limits` instead, where a number is a number.
 */
const STARTER_FEATURES = [
	'truck',
	'plane',
	'osm_maps',
	'notify_standard',
	'audit_view'
] as const;

const PROFESSIONAL_FEATURES = [
	...STARTER_FEATURES,
	'train',
	'google_maps',
	'notify_templates',
	'audit_retention',
	'white_label'
] as const;

const ENTERPRISE_FEATURES = [
	...PROFESSIONAL_FEATURES,
	'ship',
	'notify_custom',
	'audit_export',
	'white_label_domain',
	'priority_updates'
] as const;

export const TIER_FEATURES: Record<Tier, string[]> = {
	STARTER: [...STARTER_FEATURES],
	PROFESSIONAL: [...PROFESSIONAL_FEATURES],
	ENTERPRISE: [...ENTERPRISE_FEATURES]
};

export interface TierLimits {
	/** Custom branches. `null` means unlimited. */
	branches: number | null;
	/** Audit retention in days. `null` means the full retention policy. */
	auditRetentionDays: number | null;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
	STARTER: { branches: 1, auditRetentionDays: 0 },
	PROFESSIONAL: { branches: 5, auditRetentionDays: 90 },
	ENTERPRISE: { branches: null, auditRetentionDays: null }
};

export const DEFAULT_SEATS: Record<Tier, number> = {
	STARTER: 1,
	PROFESSIONAL: 3,
	ENTERPRISE: 25
};

export function featuresForTier(tier: Tier): string[] {
	return TIER_FEATURES[tier] ?? TIER_FEATURES.STARTER;
}

export function limitsForTier(tier: Tier): TierLimits {
	return TIER_LIMITS[tier] ?? TIER_LIMITS.STARTER;
}

/**
 * The features a licence actually grants.
 *
 * The stored `features` column wins when it holds anything, so a bespoke
 * enterprise deal can be expressed per licence without inventing a fourth tier.
 * Otherwise the tier's matrix applies.
 */
export function effectiveFeatures(license: Pick<License, 'tier' | 'features'>): string[] {
	if (Array.isArray(license.features) && license.features.length > 0) {
		return license.features;
	}
	return featuresForTier(license.tier as Tier);
}

/**
 * The caps a licence actually carries.
 *
 * Mirrors `effectiveFeatures`. Without this, a bespoke licence got its custom
 * features but silently kept its tier's numeric caps -- sold multi-branch,
 * capped at one -- which is a worse failure than not supporting overrides at
 * all, because nothing surfaces it.
 */
export function effectiveLimits(license: Pick<License, 'tier' | 'limits'>): TierLimits {
	const stored = license.limits;
	if (stored && typeof stored === 'object') {
		const tier = limitsForTier(license.tier as Tier);
		return {
			branches: stored.branches !== undefined ? stored.branches : tier.branches,
			auditRetentionDays:
				stored.auditRetentionDays !== undefined ? stored.auditRetentionDays : tier.auditRetentionDays
		};
	}
	return limitsForTier(license.tier as Tier);
}
