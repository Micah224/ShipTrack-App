/*
 * Human labels for the capability flags in `domain/tiers.ts`.
 *
 * Kept in `$lib` rather than `$lib/server` because the marketing page and the
 * customer portal both render it in the browser. It carries no secrets and no
 * database access — only the wording for a flag whose authority lives on the
 * server.
 *
 * WHY THIS IS A SEPARATE FILE FROM THE PRICING PAGE
 *   A pricing table written by hand is a second source of truth for what a
 *   licence grants, and the two drift the first time a tier changes. The page
 *   iterates TIER_FEATURES and looks each flag up here, so a flag added to a
 *   tier appears on the page automatically, and one renamed without a label
 *   shows its raw key — visibly wrong rather than silently missing.
 */

export interface FeatureCopy {
	label: string;
	/** Which product area it belongs to, for grouping the comparison table. */
	group: 'Transport' | 'Maps' | 'Notifications' | 'Audit' | 'Branding' | 'Support';
}

export const FEATURE_COPY: Record<string, FeatureCopy> = {
	truck: { label: 'Road shipments', group: 'Transport' },
	plane: { label: 'Air freight', group: 'Transport' },
	train: { label: 'Rail freight', group: 'Transport' },
	ship: { label: 'Sea freight', group: 'Transport' },

	osm_maps: { label: 'OpenStreetMap rendering', group: 'Maps' },
	google_maps: { label: 'Google Maps rendering', group: 'Maps' },

	notify_standard: { label: 'Standard notifications', group: 'Notifications' },
	notify_templates: { label: 'Custom notification templates', group: 'Notifications' },
	notify_custom: { label: 'Custom notification channels', group: 'Notifications' },

	audit_view: { label: 'Audit trail', group: 'Audit' },
	audit_retention: { label: 'Extended audit retention', group: 'Audit' },
	audit_export: { label: 'Audit export', group: 'Audit' },

	white_label: { label: 'White-label branding', group: 'Branding' },
	white_label_domain: { label: 'White-label on your own domain', group: 'Branding' },

	priority_updates: { label: 'Priority updates', group: 'Support' }
};

/** The label for a flag, or the flag itself when nobody has written one yet. */
export function featureLabel(flag: string): string {
	return FEATURE_COPY[flag]?.label ?? flag;
}

export const GROUP_ORDER: FeatureCopy['group'][] = [
	'Transport',
	'Maps',
	'Notifications',
	'Audit',
	'Branding',
	'Support'
];
