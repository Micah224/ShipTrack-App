import type { PageServerLoad } from './$types';
import { DEFAULT_SEATS, TIER_FEATURES, TIER_LIMITS, type Tier } from '$lib/server/domain/tiers';

/*
 * The pricing table is computed from the same matrix the licence API grants
 * from, rather than written into the page.
 *
 * A hand-written pricing table is a second source of truth about what a licence
 * includes, and the two drift the first time a tier changes — at which point the
 * page is quietly lying to prospects about what they are buying. Deriving it
 * means the page cannot disagree with the entitlement a customer's site will
 * actually receive.
 *
 * Money is the one thing NOT derived: no table in this system records what a
 * licence sells for (the dashboard omits revenue for the same reason). The
 * prices below are page copy and are marked as such.
 */

const TIERS: Tier[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const COPY: Record<Tier, { name: string; price: string; cadence: string; pitch: string }> = {
	STARTER: {
		name: 'Starter',
		price: '£49',
		cadence: 'per year',
		pitch: 'One site, road and air, with the tracking page your customers see.'
	},
	PROFESSIONAL: {
		name: 'Professional',
		price: '£149',
		cadence: 'per year',
		pitch: 'Rail, Google Maps and white-labelling across a small fleet of sites.'
	},
	ENTERPRISE: {
		name: 'Enterprise',
		price: '£449',
		cadence: 'per year',
		pitch: 'Every transport mode, unlimited branches and audit export.'
	}
};

export const load: PageServerLoad = () => ({
	tiers: TIERS.map((tier) => ({
		tier,
		...COPY[tier],
		seats: DEFAULT_SEATS[tier],
		features: TIER_FEATURES[tier],
		limits: TIER_LIMITS[tier]
	}))
});
