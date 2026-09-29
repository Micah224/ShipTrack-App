import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { hashDownloadToken } from '../crypto/keys.ts';
import {
	compareVersions,
	downloadableRelease,
	downloadableReleases,
	downloadUrl,
	isNewer,
	issueDownloadToken,
	latestRelease
} from './releases.ts';

/*
 * A stand-in for drizzle's query builder: records what each read was filtered
 * and capped by, and answers with `db.rows`. The SQL itself is rendered through
 * drizzle's own Postgres dialect below, so the predicate is checked as the
 * database would receive it rather than as an object shape.
 */
const db = vi.hoisted(() => {
	const state = {
		rows: [] as unknown[],
		where: [] as unknown[],
		limit: [] as number[],
		inserted: [] as Record<string, unknown>[]
	};
	const chain = {
		from: () => chain,
		where: (predicate: unknown) => {
			state.where.push(predicate);
			return chain;
		},
		orderBy: () => chain,
		limit: async (n: number) => {
			state.limit.push(n);
			return state.rows;
		}
	};
	return {
		state,
		handle: {
			select: () => chain,
			insert: () => ({
				values: async (row: Record<string, unknown>) => {
					state.inserted.push(row);
				}
			})
		}
	};
});

vi.mock('../db/index.ts', () => ({ getDb: () => db.handle }));

function row(version: string, publishedAt: string, extra: Record<string, unknown> = {}) {
	return { id: `id-${version}`, version, publishedAt: new Date(publishedAt), ...extra };
}

function renderedWhere(index = 0) {
	return new PgDialect().sqlToQuery(db.state.where[index] as SQL);
}

beforeEach(() => {
	db.state.rows = [];
	db.state.where = [];
	db.state.limit = [];
	db.state.inserted = [];
});

afterEach(() => {
	vi.unstubAllEnvs();
});

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

describe('latestRelease', () => {
	it('picks the highest version, not the most recently published', () => {
		db.state.rows = [row('4.9.5', '2026-09-20T00:00:00Z'), row('5.1.0', '2026-09-01T00:00:00Z')];
		return expect(latestRelease()).resolves.toMatchObject({ version: '5.1.0' });
	});

	it('considers only downloadable releases', async () => {
		await latestRelease();
		const { sql, params } = renderedWhere();
		expect(sql).toMatch(/"r2_storage_key" <> \$1 and "releases"\."file_size" > \$2/);
		expect(params).toEqual(['', 0]);
	});
});

describe('downloadableReleases', () => {
	it('lists newest version first, capped at the limit', async () => {
		db.state.rows = [
			row('5.0.1', '2026-09-25T00:00:00Z'),
			row('5.10.0', '2026-09-10T00:00:00Z'),
			row('5.9.0', '2026-09-05T00:00:00Z'),
			row('5.2.0', '2026-09-01T00:00:00Z')
		];
		const listed = await downloadableReleases(3);
		expect(listed.map((r) => r.version)).toEqual(['5.10.0', '5.9.0', '5.2.0']);
	});

	it('defaults to ten, read from the same window as latestRelease', async () => {
		db.state.rows = Array.from({ length: 14 }, (_, i) => row(`5.${i}.0`, '2026-09-01T00:00:00Z'));
		const listed = await downloadableReleases();
		expect(listed).toHaveLength(10);
		expect(listed[0].version).toBe('5.13.0');

		await latestRelease();
		expect(db.state.limit[0]).toBe(db.state.limit[1]);
		expect(renderedWhere(0).sql).toBe(renderedWhere(1).sql);
	});

	it('filters to downloadable rows', async () => {
		await downloadableReleases();
		expect(renderedWhere().sql).toContain('"r2_storage_key" <> $1');
	});
});

describe('downloadableRelease', () => {
	it('looks up the exact version, downloadable only', async () => {
		db.state.rows = [row('5.1.0', '2026-09-01T00:00:00Z')];
		await expect(downloadableRelease('5.1.0')).resolves.toMatchObject({ id: 'id-5.1.0' });
		const { sql, params } = renderedWhere();
		expect(sql).toMatch(/"version" = \$1 and \("releases"\."r2_storage_key" <> \$2/);
		expect(params).toEqual(['5.1.0', '', 0]);
		expect(db.state.limit).toEqual([1]);
	});

	it('is undefined for a version that is not there', async () => {
		await expect(downloadableRelease('9.9.9')).resolves.toBeUndefined();
	});
});

describe('issueDownloadToken', () => {
	it('stores only the hash, bound to the licence, release and host, for the configured TTL', async () => {
		vi.stubEnv('DOWNLOAD_TOKEN_TTL_MINUTES', '5');
		const before = Date.now();

		const { token, expiresAt } = await issueDownloadToken({
			licenseId: 'lic-1',
			releaseId: 'rel-1',
			domain: 'owlex.example.com'
		});

		expect(db.state.inserted).toHaveLength(1);
		const stored = db.state.inserted[0];
		expect(stored).toMatchObject({
			tokenHash: hashDownloadToken(token),
			licenseId: 'lic-1',
			releaseId: 'rel-1',
			domain: 'owlex.example.com',
			expiresAt
		});
		expect(JSON.stringify(stored)).not.toContain(token);
		expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(5 * 60_000);
		expect(expiresAt.getTime() - before).toBeLessThan(5 * 60_000 + 5_000);
	});

	it('mints a different token every time', async () => {
		const grant = { licenseId: 'l', releaseId: 'r', domain: 'd.example' };
		const first = await issueDownloadToken(grant);
		const second = await issueDownloadToken(grant);
		expect(first.token).not.toBe(second.token);
	});
});

describe('downloadUrl', () => {
	it('points at the download route on the public origin, with no doubled slash', () => {
		vi.stubEnv('PUBLIC_APP_URL', 'https://licence.example.com/');
		expect(downloadUrl('tok_abc')).toBe('https://licence.example.com/api/v1/updates/download/tok_abc');
	});
});
