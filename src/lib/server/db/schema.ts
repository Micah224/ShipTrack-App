import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

/*
 * Enums
 *
 * Postgres enums need ALTER TYPE to extend and cannot drop a value. They are
 * used here only where the value set is genuinely closed — a licence is one of
 * four states and a tier is one of three. Anything open-ended stays text.
 */
export const licenseStatusEnum = pgEnum('license_status', [
	'ACTIVE',
	'SUSPENDED',
	'EXPIRED',
	'REVOKED'
]);

export const licenseTierEnum = pgEnum('license_tier', ['STARTER', 'PROFESSIONAL', 'ENTERPRISE']);

/*
 * Where an activation lives. Section 11 of the master plan whitelists four
 * kinds of non-production site; `counts_seat` is the decision and this column
 * is the reason for it, which is what a support screen needs to show.
 */
export const environmentEnum = pgEnum('activation_environment', [
	'PRODUCTION',
	'STAGING',
	'DEVELOPMENT',
	'LOCAL'
]);

export const releaseReasonEnum = pgEnum('activation_release_reason', [
	'SELF_SERVICE',
	'AUTO_RECLAIM',
	'ADMIN',
	// Lost a concurrent race for the last seat and backed itself out. See
	// claimSeat in domain/seats.ts for why that is a real state and not a bug.
	'SUPERSEDED'
]);

export const customers = pgTable('customers', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	companyName: text('company_name'),
	stripeCustomerId: text('stripe_customer_id'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

/*
 * Licences.
 *
 * The key itself is never stored in plaintext. `key_hash` is the O(1) lookup
 * every activation goes through, `key_cipher` is AES-256-GCM under a secret
 * held outside the database, and `key_prefix` is the only plaintext fragment —
 * enough for support to find a row, useless to an attacker.
 *
 * This is the one place licence keys must differ from passwords: a customer who
 * loses a key has nothing to reset to, because reissuing breaks every site
 * already activated against the old one. Reveal has to work, so the ciphertext
 * sits beside the hash rather than the hash standing alone.
 */
export const licenses = pgTable(
	'licenses',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		keyHash: text('key_hash').notNull().unique(),
		keyCipher: text('key_cipher').notNull(),
		keyPrefix: text('key_prefix').notNull(),
		customerId: uuid('customer_id')
			.notNull()
			.references(() => customers.id, { onDelete: 'cascade' }),
		label: text('label'),
		tier: licenseTierEnum('tier').default('STARTER').notNull(),
		maxSeats: integer('max_seats').default(1).notNull(),
		status: licenseStatusEnum('status').default('ACTIVE').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		gracePeriodDays: integer('grace_period_days').default(7).notNull(),
		/*
		 * Empty means "use the tier's matrix"; a non-empty array overrides it for
		 * a bespoke deal. The default MUST stay empty: seeding it with concrete
		 * features would silently override the tier on every row the mint CLI
		 * writes, and every licence above STARTER would quietly grant Starter's
		 * capabilities instead of the ones it was sold.
		 */
		features: jsonb('features').$type<string[]>().default([]).notNull(),
		/* Same contract for the numeric caps. Null means "use the tier's". */
		limits: jsonb('limits').$type<{ branches: number | null; auditRetentionDays: number | null }>(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('license_hash_status_idx').on(table.keyHash, table.status),
		index('license_prefix_idx').on(table.keyPrefix),
		index('license_customer_idx').on(table.customerId)
	]
);

/*
 * Activations — one row per install, not per domain.
 *
 * The seat is held by the (licence, install_id) pair. install_id is a UUID the
 * plugin mints once and keeps; the domain is recorded beside it for support and
 * for the token's domain binding, but a site that moves domain keeps its seat
 * rather than silently consuming a second one.
 */
export const activations = pgTable(
	'activations',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		licenseId: uuid('license_id')
			.notNull()
			.references(() => licenses.id, { onDelete: 'cascade' }),
		installId: text('install_id').notNull(),
		domain: text('domain').notNull(),
		siteUrl: text('site_url').notNull(),
		ipAddress: text('ip_address'),
		pluginVersion: text('plugin_version').notNull(),
		wpVersion: text('wp_version'),
		phpVersion: text('php_version'),
		activeMapProvider: text('active_map_provider'),
		transportModesUsed: jsonb('transport_modes_used').$type<string[]>().default([]).notNull(),
		environment: environmentEnum('environment').default('PRODUCTION').notNull(),
		countsSeat: boolean('counts_seat').default(true).notNull(),
		lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).defaultNow().notNull(),
		/*
		 * When this install last took a seat, which is NOT when the row was
		 * created: a released install that re-activates takes a *new* seat and
		 * must queue behind whoever took one in the meantime. Ordering by
		 * created_at instead would let a long-dormant install evict a live one.
		 */
		seatClaimedAt: timestamp('seat_claimed_at', { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		releasedAt: timestamp('released_at', { withTimezone: true }),
		releaseReason: releaseReasonEnum('release_reason')
	},
	(table) => [
		uniqueIndex('activation_install_unique').on(table.licenseId, table.installId),
		index('activation_domain_idx').on(table.domain),
		index('activation_seat_idx').on(table.licenseId, table.releasedAt, table.countsSeat),
		index('activation_claim_idx').on(table.licenseId, table.seatClaimedAt),
		index('activation_heartbeat_idx').on(table.lastHeartbeat)
	]
);

export const releases = pgTable(
	'releases',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tag: text('tag').notNull().unique(),
		version: text('version').notNull().unique(),
		minPhp: text('min_php').default('8.1').notNull(),
		minWp: text('min_wp').default('6.5').notNull(),
		testedUpTo: text('tested_up_to').default('7.0').notNull(),
		changelog: text('changelog').notNull(),
		changelogHtml: text('changelog_html'),
		r2StorageKey: text('r2_storage_key').notNull(),
		fileSize: integer('file_size').notNull(),
		fileSha256: text('file_sha256').notNull(),
		downloadCount: integer('download_count').default(0).notNull(),
		publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull()
	},
	// Read on every heartbeat and every update check, always newest-first.
	(table) => [index('release_published_idx').on(table.publishedAt)]
);

/*
 * Ephemeral single-use download tokens.
 *
 * Only the hash is stored. The raw token exists in the URL handed to WordPress
 * and nowhere else, so a database dump cannot be replayed into a download.
 */
export const downloadTokens = pgTable(
	'download_tokens',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tokenHash: text('token_hash').notNull().unique(),
		licenseId: uuid('license_id')
			.notNull()
			.references(() => licenses.id, { onDelete: 'cascade' }),
		releaseId: uuid('release_id')
			.notNull()
			.references(() => releases.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('download_token_expiry_idx').on(table.expiresAt)]
);

export const auditLogs = pgTable(
	'audit_logs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		licenseId: uuid('license_id').references(() => licenses.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		actor: text('actor').notNull(),
		details: jsonb('details'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('audit_license_idx').on(table.licenseId, table.createdAt)]
);

export const customersRelations = relations(customers, ({ many }) => ({
	licenses: many(licenses)
}));

export const licensesRelations = relations(licenses, ({ one, many }) => ({
	customer: one(customers, { fields: [licenses.customerId], references: [customers.id] }),
	activations: many(activations),
	downloadTokens: many(downloadTokens),
	auditLogs: many(auditLogs)
}));

export const activationsRelations = relations(activations, ({ one }) => ({
	license: one(licenses, { fields: [activations.licenseId], references: [licenses.id] })
}));

export const releasesRelations = relations(releases, ({ many }) => ({
	downloadTokens: many(downloadTokens)
}));

export const downloadTokensRelations = relations(downloadTokens, ({ one }) => ({
	license: one(licenses, { fields: [downloadTokens.licenseId], references: [licenses.id] }),
	release: one(releases, { fields: [downloadTokens.releaseId], references: [releases.id] })
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	license: one(licenses, { fields: [auditLogs.licenseId], references: [licenses.id] })
}));

export type Customer = typeof customers.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type Activation = typeof activations.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type DownloadToken = typeof downloadTokens.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
