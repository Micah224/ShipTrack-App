import { afterEach, describe, expect, it } from 'vitest';
import { supportEmail } from './support.ts';

describe('supportEmail', () => {
	const original = process.env.SUPPORT_EMAIL;

	afterEach(() => {
		if (original === undefined) delete process.env.SUPPORT_EMAIL;
		else process.env.SUPPORT_EMAIL = original;
	});

	it('is null when unset or blank, so pages fall back to the seller', () => {
		delete process.env.SUPPORT_EMAIL;
		expect(supportEmail()).toBeNull();
		process.env.SUPPORT_EMAIL = '   ';
		expect(supportEmail()).toBeNull();
	});

	it('returns a plain address, trimmed', () => {
		process.env.SUPPORT_EMAIL = '  help@example.com ';
		expect(supportEmail()).toBe('help@example.com');
	});

	it('refuses anything that would publish a broken mailto link', () => {
		for (const bad of ['help', 'help@', '@example.com', 'help@example', 'a b@example.com']) {
			process.env.SUPPORT_EMAIL = bad;
			expect(supportEmail()).toBeNull();
		}
	});
});
