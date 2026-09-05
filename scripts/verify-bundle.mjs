/*
 * Loads what Vercel actually deploys, the way Vercel actually loads it.
 *
 * WHY THIS EXISTS
 *   `npm run build` proves the bundle can be WRITTEN, not that it can be RUN.
 *   A dependency left external is merely an import in the output; whether it
 *   resolves is decided in the deployment, against a different directory, by a
 *   loader with different rules. Two production outages lived in that gap:
 *
 *     ERR_REQUIRE_ESM              sanitize-html (CommonJS) requiring
 *                                  htmlparser2, ESM-only from v11. Vercel's
 *                                  loader cannot require() an ES module; local
 *                                  Node 22 can, which is why every other gate
 *                                  stayed green while five routes served 500.
 *     Cannot find 'escape-...'     the first attempted fix bundled
 *                                  sanitize-html, which dropped it out of the
 *                                  adapter's dependency trace and left its own
 *                                  CommonJS dependencies unshipped.
 *
 * WHY IT CHECKS *THIS* DIRECTORY
 *   .svelte-kit/output/server resolves against the repository's node_modules,
 *   where everything is installed, so checking it proves nothing. What ships is
 *   .vercel/output/functions/**\/*.func, each carrying a TRACED subset of
 *   node_modules holding only what the adapter saw imported.
 *
 *   The bundle is copied to a temporary directory before being loaded, and that
 *   is not incidental. Node resolves a bare specifier by walking UP the tree, so
 *   loading in place lets a chunk find the repository's own node_modules sitting
 *   above .vercel/ -- where every package is installed, including the ones the
 *   trace omitted. In the deployment /var/task is the root and there is nothing
 *   above it. Without the copy this script certifies the broken build as
 *   healthy; it did exactly that in an earlier draft.
 *
 * WHY EVERY CHUNK, NOT JUST THE HANDLER
 *   SvelteKit lazy-loads route modules, so the handler imports cleanly even
 *   when a route it will later need cannot resolve. That is precisely the
 *   shape of both failures above -- the entry was fine and /admin was not --
 *   so the handler alone would have certified the broken build as healthy. It
 *   did, in an earlier draft of this script.
 *
 * HOW IT REPRODUCES PRODUCTION
 *   --no-experimental-require-module (applied by the npm script) switches off
 *   Node 22's require-of-ESM, the one behaviour that hid the first failure.
 *
 * WHAT IT DOES NOT DO
 *   It loads modules; it does not serve requests. Environment variables are
 *   read lazily inside handlers, so a bundle that loads may still refuse a
 *   request -- a missing PORTAL_JWT_SECRET is not this script's business.
 *   Evaluation errors are reported but not failed on; only resolution faults,
 *   which could never have worked in the deployment, are fatal.
 */
import { cp, mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, relative, resolve } from 'node:path';

const OUTPUT = resolve(process.cwd(), '.vercel/output/functions');

/** Faults that mean "this could never have run in the deployment". */
const FATAL = new Set([
	'ERR_REQUIRE_ESM',
	'ERR_MODULE_NOT_FOUND',
	'MODULE_NOT_FOUND',
	'ERR_PACKAGE_PATH_NOT_EXPORTED',
	'ERR_UNSUPPORTED_DIR_IMPORT'
]);

async function isDir(p) {
	try {
		return (await stat(p)).isDirectory();
	} catch {
		return false;
	}
}

/*
 * Functions are found by walking, not listing: the adapter nests them under the
 * route tree (api/v1/activate.func) and points several at one implementation
 * through symlinks (index.func -> "![-]/catchall.func"). A flat readdir with an
 * isDirectory() filter finds none of them. Resolved paths are de-duplicated,
 * since several routes sharing a catch-all is several names for one bundle.
 */
async function findFuncs(dir, seen = new Map()) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return seen;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		// stat, not lstat: a .func is frequently a symlink to a shared bundle.
		if (!(await isDir(full))) continue;
		if (entry.name.endsWith('.func')) {
			const real = await realpath(full);
			if (!seen.has(real)) seen.set(real, []);
			seen.get(real).push(relative(OUTPUT, full));
		} else {
			await findFuncs(full, seen);
		}
	}
	return seen;
}

/** Every emitted chunk in the bundle, excluding the shipped dependencies. */
async function chunksIn(dir, out = []) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const full = join(dir, entry.name);
		if (await isDir(full)) await chunksIn(full, out);
		else if (entry.name.endsWith('.js')) out.push(full);
	}
	return out;
}

if (!(await isDir(OUTPUT))) {
	console.error(`verify:bundle — no deployable output at ${OUTPUT}. Run \`npm run build\` first.`);
	process.exit(1);
}

const found = await findFuncs(OUTPUT);
if (found.size === 0) {
	console.error(`verify:bundle — ${OUTPUT} contains no .func directories.`);
	process.exit(1);
}

const failures = [];
let checked = 0;

const scratch = await mkdtemp(join(tmpdir(), 'verify-bundle-'));

try {
	for (const [dir, routes] of found) {
		const label = routes.sort()[0] + (routes.length > 1 ? ` (+${routes.length - 1} more)` : '');

		/*
		 * Copied out of the repository so that upward resolution finds nothing,
		 * matching /var/task. Symlinks are dereferenced: the traced node_modules
		 * frequently links back into the repository store, and following those
		 * links home would reintroduce the very packages this is checking for.
		 */
		const sandbox = join(scratch, label.replace(/[^\w.-]+/g, '_'));
		await cp(dir, sandbox, { recursive: true, dereference: true });

		const chunks = await chunksIn(sandbox);

		if (chunks.length === 0) {
			failures.push({ label, chunk: '', code: 'EMPTY_BUNDLE', message: 'no JavaScript in the function' });
			continue;
		}

		try {
			const cfg = JSON.parse(await readFile(join(sandbox, '.vc-config.json'), 'utf8'));
			if (cfg.handler && !chunks.some((c) => relative(sandbox, c) === cfg.handler)) {
				failures.push({ label, chunk: cfg.handler, code: 'NO_HANDLER', message: 'declared handler is not in the bundle' });
			}
		} catch {
			/* no config to cross-check against */
		}

		for (const chunk of chunks) {
			checked++;
			try {
				await import(pathToFileURL(chunk).href);
			} catch (error) {
				const code = error?.code ?? '';
				const first = String(error?.message ?? error).split('\n')[0];
				if (FATAL.has(code)) {
					failures.push({ label, chunk: relative(sandbox, chunk), code, message: first });
				} else if (code || error?.name) {
					console.warn(`  note: ${relative(sandbox, chunk)} evaluated with ${code || error.name}: ${first}`);
				}
			}
		}
	}
} finally {
	await rm(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`\nverify:bundle — ${failures.length} chunk(s) cannot load the way Vercel loads them:\n`);
	const shown = failures.slice(0, 15);
	for (const f of shown) console.error(`  [${f.label}] ${f.chunk}\n    ${f.code}: ${f.message}\n`);
	if (failures.length > shown.length) console.error(`  …and ${failures.length - shown.length} more.\n`);
	process.exit(1);
}

console.log(`verify:bundle — ${checked} chunks across ${found.size} deployable function bundle(s) load cleanly.`);
