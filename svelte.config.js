import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Node, not edge: the licence endpoints sign Ed25519 with node:crypto and
		// the webhook streams multi-megabyte release archives through the AWS SDK.
		// Neither belongs in the edge runtime's constrained API surface.
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
