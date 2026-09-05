import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// No `runtime` here on purpose. The option is deprecated, and pinning it
		// would contradict .nvmrc: left unset, the adapter follows the Node
		// version configured on the Vercel project itself.
		//
		// What must not change is that these are serverless functions rather than
		// edge ones: the licence endpoints sign Ed25519 with node:crypto and the
		// webhook streams multi-megabyte release archives through the AWS SDK.
		// Neither fits the edge runtime's API surface.
		adapter: adapter()
	}
};

export default config;
