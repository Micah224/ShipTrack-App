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
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		}
	};
});
