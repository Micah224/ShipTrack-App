import { describe, expect, it } from 'vitest';
import { licenseState, stateRefusal } from './licenses.ts';
import type { License } from '../db/schema.ts';

function license(overrides: Partial<License> = {}): License {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		keyHash: 'hash',
		keyCipher: 'cipher',
		keyPrefix: 'STP-TEST',
		customerId: '00000000-0000-0000-0000-000000000002',
		label: null,
		tier: 'PROFESSIONAL',
		maxSeats: 3,
		status: 'ACTIVE',
		expiresAt: null,
		gracePeriodDays: 7,
		features: [],
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		...overrides
	} as License;
}

const NOW = new Date('2026-09-03T12:00:00Z');

describe('licenseState', () => {
	it('treats a licence with no expiry as perpetual', () => {
		expect(licenseState(license(), NOW)).toBe('ACTIVE');
	});

	it('is ACTIVE up to and including the expiry instant', () => {
		expect(licenseState(license({ expiresAt: NOW }), NOW)).toBe('ACTIVE');
	});

	it('enters GRACE the moment it expires, not EXPIRED', () => {
		const expired = new Date('2026-09-01T12:00:00Z');
		expect(licenseState(license({ expiresAt: expired }), NOW)).toBe('GRACE');
	});

	it('stays in GRACE for the full grace period', () => {
		// Expired 6 days and 23 hours ago, with a 7-day grace: still covered.
		const expired = new Date('2026-08-27T13:00:00Z');
		expect(licenseState(license({ expiresAt: expired }), NOW)).toBe('GRACE');
	});

	it('becomes EXPIRED once the grace period is past', () => {
		const expired = new Date('2026-08-20T12:00:00Z');
		expect(licenseState(license({ expiresAt: expired }), NOW)).toBe('EXPIRED');
	});

	it('honours a zero-day grace period', () => {
		const expired = new Date('2026-09-02T12:00:00Z');
		expect(licenseState(license({ expiresAt: expired, gracePeriodDays: 0 }), NOW)).toBe('EXPIRED');
	});

	it('lets an explicit status override an unexpired date', () => {
		expect(licenseState(license({ status: 'REVOKED' }), NOW)).toBe('REVOKED');
		expect(licenseState(license({ status: 'SUSPENDED' }), NOW)).toBe('SUSPENDED');
	});
});

describe('stateRefusal', () => {
	it('lets ACTIVE and GRACE through', () => {
		expect(stateRefusal('ACTIVE')).toBeNull();
		expect(stateRefusal('GRACE')).toBeNull();
	});

	it('refuses the three dead states with distinct codes', () => {
		expect(stateRefusal('REVOKED')?.code).toBe('license_revoked');
		expect(stateRefusal('SUSPENDED')?.code).toBe('license_suspended');
		expect(stateRefusal('EXPIRED')?.code).toBe('license_expired');
	});
});
