import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The `scripts/*.ts` CLIs import these modules under bare Node, not Vite.
 *
 * Node's ESM resolver does no extension inference and no directory-index
 * lookup, so an extensionless specifier and a bare directory both fail there
 * while Vite and vitest resolve them happily. (This comment deliberately does
 * not spell either shape out: the scan below reads this file too.) The
 * asymmetry is invisible until someone runs
 * `npm run license:mint` — which is exactly when a customer is waiting for a
 * licence key. These tests read the specifiers rather than trusting them.
 */

const SERVER = resolve(import.meta.dirname);

function tsFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return tsFiles(path);
		return path.endsWith('.ts') ? [path] : [];
	});
}

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*'(\.\.?\/[^']*)'/g;

function relativeSpecifiers(file: string): string[] {
	return [...readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)].map((m) => m[1]);
}

describe('server modules are importable from bare Node', () => {
	const files = tsFiles(SERVER);

	it('finds the modules it is meant to be checking', () => {
		expect(files.length).toBeGreaterThan(10);
		expect(files.some((f) => f.endsWith('crypto/keys.ts'))).toBe(true);
	});

	it.each(files.map((f) => [f.slice(SERVER.length + 1), f]))(
		'%s uses only resolvable relative specifiers',
		(_label, file) => {
			for (const specifier of relativeSpecifiers(file)) {
				// A bare directory would need index resolution, which Node does not do.
				expect(specifier, `${specifier} needs an explicit extension`).toMatch(/\.(ts|js|json)$/);

				const target = resolve(dirname(file), specifier);
				expect(
					statSync(target, { throwIfNoEntry: false })?.isFile() ?? false,
					`${specifier} does not resolve to a file`
				).toBe(true);
			}
		}
	);
});
