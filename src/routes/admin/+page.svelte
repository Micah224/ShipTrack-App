<script lang="ts">
	let { data } = $props();

	const stats = $derived(data.stats);
	const utilisation = $derived(
		stats.seats.capacity > 0 ? Math.round((stats.seats.used / stats.seats.capacity) * 100) : 0
	);
	const totalInstalls = $derived(stats.installs.production + stats.installs.nonProduction);

	function pct(n: number, total: number): number {
		return total > 0 ? Math.round((n / total) * 100) : 0;
	}
</script>

<svelte:head><title>Overview · ShipTrack Pro</title></svelte:head>

<h1 class="h4 mb-6">Overview</h1>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	<div class="card preset-outlined-surface-200-800 p-5">
		<p class="text-sm opacity-70">Active licences</p>
		<p class="text-3xl font-bold">{stats.licenses.active}</p>
		<p class="mt-1 text-xs opacity-60">{stats.licenses.total} issued in total</p>
	</div>

	<div class="card preset-outlined-surface-200-800 p-5">
		<p class="text-sm opacity-70">Seat utilisation</p>
		<p class="text-3xl font-bold">{utilisation}%</p>
		<div class="meter mt-2" role="meter" aria-valuenow={utilisation} aria-valuemin="0" aria-valuemax="100">
			<div class="bg-secondary-500 h-2 rounded" style="width: {Math.min(utilisation, 100)}%"></div>
		</div>
		<p class="mt-1 text-xs opacity-60">
			{stats.seats.used} of {stats.seats.capacity} production seats
		</p>
	</div>

	<div class="card preset-outlined-surface-200-800 p-5">
		<p class="text-sm opacity-70">Live installs</p>
		<p class="text-3xl font-bold">{totalInstalls}</p>
		<p class="mt-1 text-xs opacity-60">
			{stats.installs.production} production · {stats.installs.nonProduction} staging or local
		</p>
	</div>

	<div class="card preset-outlined-surface-200-800 p-5">
		<p class="text-sm opacity-70">Latest release</p>
		<p class="text-3xl font-bold">{stats.latestRelease?.version ?? '—'}</p>
		<p class="mt-1 text-xs opacity-60">
			{#if stats.latestRelease}
				published {new Date(stats.latestRelease.publishedAt).toLocaleDateString()}
			{:else}
				nothing ingested yet
			{/if}
		</p>
	</div>
</div>

<div class="mt-6 grid gap-4 lg:grid-cols-2">
	<div class="card preset-outlined-surface-200-800 p-5">
		<h2 class="h6 mb-3">Version adoption</h2>
		{#if stats.versions.length === 0}
			<p class="text-sm opacity-60">No installs have reported in yet.</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each stats.versions as row (row.version)}
					<li>
						<div class="mb-1 flex justify-between text-sm">
							<span class="font-medium">
								{row.version}
								{#if row.version === stats.latestRelease?.version}
									<span class="badge preset-filled-success-500 ml-1 text-xs">current</span>
								{/if}
							</span>
							<span class="opacity-70">{row.installs} ({pct(row.installs, totalInstalls)}%)</span>
						</div>
						<div class="bg-surface-200-800 h-2 rounded">
							<div
								class="bg-primary-500 h-2 rounded"
								style="width: {pct(row.installs, totalInstalls)}%"
							></div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="card preset-outlined-surface-200-800 p-5">
		<h2 class="h6 mb-3">Licences by tier</h2>
		{#if stats.byTier.length === 0}
			<p class="text-sm opacity-60">No licences have been minted yet.</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each stats.byTier as row (row.tier)}
					<li class="flex items-center justify-between text-sm">
						<span class="badge preset-tonal-primary">{row.tier}</span>
						<span class="opacity-70">{row.count}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<h2 class="h6 mt-6 mb-3">Attention</h2>
		<ul class="flex flex-col gap-1 text-sm">
			<li class="flex justify-between">
				<span class="opacity-70">Stale installs (no heartbeat in 3 days)</span>
				<span class="font-medium">{stats.installs.stale}</span>
			</li>
			<li class="flex justify-between">
				<span class="opacity-70">Revoked licences</span>
				<span class="font-medium">{stats.licenses.revoked}</span>
			</li>
			<li class="flex justify-between">
				<span class="opacity-70">Expired licences</span>
				<span class="font-medium">{stats.licenses.expired}</span>
			</li>
			<li class="flex justify-between">
				<span class="opacity-70">Suspended licences</span>
				<span class="font-medium">{stats.licenses.suspended}</span>
			</li>
		</ul>
	</div>
</div>

<p class="mt-6 text-xs opacity-60">
	Revenue figures are not shown: no table records what a licence was sold for, so any ARR or MRR
	here would be invented. Adding a price to the licence, or restoring an orders table, is what makes
	that number real.
</p>
