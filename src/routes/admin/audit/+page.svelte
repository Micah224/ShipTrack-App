<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	function tone(action: string): string {
		if (action.includes('failed') || action.includes('blocked') || action.includes('revoked')) {
			return 'preset-tonal-error';
		}
		if (action.includes('revealed') || action.includes('seat_limit')) return 'preset-tonal-warning';
		if (action.startsWith('admin.')) return 'preset-tonal-primary';
		return 'preset-tonal-surface';
	}

	// Built by hand rather than with URLSearchParams: the linter flags the
	// mutable built-in inside a component, and two encoded pairs do not need it.
	function query(page: number): string {
		return data.search ? `q=${encodeURIComponent(data.search)}&page=${page}` : `page=${page}`;
	}
</script>

<svelte:head><title>Audit · ShipTrack Pro</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center gap-4">
	<h1 class="h4">Audit log</h1>
	<form method="GET" class="flex gap-2">
		<input class="input" type="search" name="q" placeholder="Search action or actor" value={data.search} />
		<button class="btn preset-outlined-surface-200-800" type="submit">Search</button>
	</form>
</div>

<div class="table-wrap">
	<table class="table">
		<thead>
			<tr><th>When</th><th>Action</th><th>Actor</th><th>Details</th></tr>
		</thead>
		<tbody>
			{#each data.entries as entry (entry.id)}
				<tr>
					<td class="text-sm whitespace-nowrap">
						{new Date(entry.createdAt).toLocaleString()}
					</td>
					<td><span class="badge {tone(entry.action)}">{entry.action}</span></td>
					<td class="text-sm">{entry.actor}</td>
					<td class="text-xs opacity-70">
						{#if entry.details && Object.keys(entry.details).length > 0}
							<code class="break-all">{JSON.stringify(entry.details)}</code>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="py-8 text-center opacity-60">Nothing recorded yet.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="mt-4 flex items-center gap-2">
	{#if data.page > 1}
		<a
			class="btn btn-sm preset-outlined-surface-200-800"
			href={resolve(`/admin/audit?${query(data.page - 1)}`)}>Previous</a
		>
	{/if}
	<span class="text-sm opacity-60">Page {data.page}</span>
	{#if data.hasNext}
		<a
			class="btn btn-sm preset-outlined-surface-200-800"
			href={resolve(`/admin/audit?${query(data.page + 1)}`)}>Next</a
		>
	{/if}
</div>
