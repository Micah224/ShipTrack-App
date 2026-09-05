/*
 * Loads the built server bundle the way Vercel's runtime does, and fails if it
 * cannot.
 *
 * WHY THIS EXISTS
 *   `npm run build` proves the bundle can be WRITTEN, not that it can be RUN. A
 *   dependency left external is merely an import in the output; whether that
 *   import resolves is decided in the deployment, by a Node whose module loader
 *   is not the one the build ran under.
 *
 *   That gap shipped a broken admin console: sanitize-html is CommonJS and
 *   require()s htmlparser2, which is ESM-only from v12. Local Node 22 allows
 *   require() of an ES module, so dev, vitest and the build were all green.
 *   Vercel's loader does not, so every admin route answered 500 with
 *   ERR_REQUIRE_ESM. Nothing in the pipeline looked at the artefact.
 *
 * HOW IT REPRODUCES PRODUCTION
 *   --no-experimental-require-module (applied by the npm script) turns off
 *   Node 22's require-of-ESM, which is the single behaviour that made this
 *   invisible locally. Under that flag the failure is identical to the one
 *   Vercel logged, down to the message.
 *
 * WHAT IT DOES NOT DO
 *   It imports modules; it does not serve requests. Missing environment
 *   variables are therefore not its business -- env.ts reads them lazily inside
 *   handlers, so a bundle that loads may still refuse a request. This checks
 *   that the artefact is loadable at all, which is the failure the build hides.
 */
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), '.svelte-kit/output/server');

async function walk(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(full)));
		else if (entry.name.endsWith('.js')) out.push(full);
	}
	return out;
}

let files;
try {
	files = await walk(root);
} catch {
	console.error(`verify:bundle — no build found at ${root}. Run \`npm run build\` first.`);
	process.exit(1);
}

const failures = [];
for (const file of files) {
	try {
		await import(pathToFileURL(file).href);
	} catch (error) {
		/*
		 * Only module-resolution faults are this check's concern. A chunk that
		 * throws while EVALUATING -- a missing env var read at module scope, say --
		 * is a different bug and would make this check fail for the wrong reason.
		 */
		const code = error?.code ?? '';
		if (code === 'ERR_REQUIRE_ESM' || code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
			failures.push({ file: file.slice(root.length + 1), code, message: String(error.message).split('\n')[0] });
		}
	}
}

if (failures.length > 0) {
	console.error(`verify:bundle — ${failures.length} chunk(s) cannot load under production's module loader:\n`);
	for (const f of failures) console.error(`  ${f.file}\n    ${f.code}: ${f.message}\n`);
	process.exit(1);
}

console.log(`verify:bundle — ${files.length} server chunks load cleanly.`);
