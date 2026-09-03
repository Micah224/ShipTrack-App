<script lang="ts">
	const endpoints = [
		{ method: 'POST', path: '/api/v1/activate', purpose: 'Bind an install to a licence and issue a signed entitlement' },
		{ method: 'POST', path: '/api/v1/heartbeat', purpose: 'Refresh the entitlement and report site telemetry' },
		{ method: 'POST', path: '/api/v1/deactivate', purpose: 'Release a seat' },
		{ method: 'POST', path: '/api/v1/updates/check', purpose: 'WordPress update transient' },
		{ method: 'POST', path: '/api/v1/updates/info', purpose: 'Version details modal' },
		{ method: 'GET', path: '/api/v1/updates/download/[token]', purpose: 'Single-use redirect to R2' }
	];
</script>

<svelte:head>
	<title>ShipTrack Pro Licensing</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-8 p-8">
	<header class="flex flex-col gap-2">
		<h1 class="h1">ShipTrack Pro</h1>
		<p class="text-lg opacity-80">Licensing, entitlement and update distribution.</p>
	</header>

	<section class="card preset-outlined-surface-200-800 p-6">
		<h2 class="h4 mb-4">API surface</h2>
		<ul class="flex flex-col gap-3">
			{#each endpoints as endpoint (endpoint.path)}
				<li class="flex flex-col gap-1">
					<code class="text-sm font-semibold">{endpoint.method} {endpoint.path}</code>
					<span class="text-sm opacity-70">{endpoint.purpose}</span>
				</li>
			{/each}
		</ul>
	</section>

	<footer class="text-sm opacity-60">
		This host serves machine clients. The customer portal and admin console are not part of this
		deployment yet.
	</footer>
</main>
