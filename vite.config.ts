import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// loadEnv comes from vite; vitest/config re-exports defineConfig but not this.
import { loadEnv } from 'vite';
// vitest/config, not vite, for defineConfig: vite's own does not know about the
// `test` key and rejects it at typecheck time even though vitest reads it.
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
	/*
	 * Load .env into process.env.
	 *
	 * src/lib/server/env.ts reads process.env rather than $env/dynamic/private,
	 * so the mint and keygen CLIs can import the same modules the server uses.
	 * Vite does not populate process.env from .env on its own -- it exposes those
	 * values through import.meta.env instead -- so without this the dev server
	 * starts fine and then reports every secret as missing, which is a confusing
	 * way to spend an afternoon.
	 *
	 * Existing variables win: on Vercel the real environment is already
	 * populated, and a stray committed .env must never override it.
	 */
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
		process.env[key] ??= value;
	}

	return {
		plugins: [tailwindcss(), sveltekit()],
		ssr: {
			/*
			 * Bundle sanitize-html rather than leaving it as a runtime import.
			 *
			 * It is CommonJS and does `require('htmlparser2')`, but declares
			 * `htmlparser2: ^12`, and v12 is ESM-only. Node 22 papers over that
			 * locally because it can require() an ES module; Vercel's serverless
			 * loader cannot, so every route that pulled this chunk in answered 500
			 * with ERR_REQUIRE_ESM -- the whole admin console, because the releases
			 * screen renders sanitized changelog HTML.
			 *
			 * Nothing caught it: the build succeeds (the import is merely
			 * externalized), and dev and vitest both go through Vite's resolver,
			 * which does the interop for them. Only the deployed artefact was
			 * broken. `npm run verify:bundle` now runs the built server under
			 * bare Node with require-of-ESM switched off, which is what production
			 * actually does.
			 *
			 * Bundling makes Rollup do the interop at build time, so no require()
			 * of an ES module survives into the deployment. Preferred over pinning
			 * htmlparser2 back to ^10 with `overrides`, which would leave
			 * sanitize-html running against a dependency older than the one it
			 * asks for.
			 *
			 * htmlparser2 is listed too, and must be: bundling only sanitize-html
			 * leaves its dependency external, and Rolldown then emits a require()
			 * shim for it in the CJS interop -- the same failure one layer down.
			 */
			noExternal: ['sanitize-html', 'htmlparser2']
		},
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		}
	};
});
