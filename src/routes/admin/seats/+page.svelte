<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const STALE_MS = 3 * 24 * 60 * 60 * 1000;

	function heartbeatAge(value: Date | string): { label: string; stale: boolean } {
		const ms = Date.now() - new Date(value).getTime();
		const stale = ms > STALE_MS;
		const minutes = Math.floor(ms / 60000);
		if (minutes < 60) return { label: `${minutes}m ago`, stale };
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return { label: `${hours}h ago`, stale };
		return { label: `${Math.floor(hours / 24)}d ago`, stale };
	}

	function envBadge(environment: string): string {
		return environment === 'PRODUCTION' ? 'preset-filled-primary-500' : 'preset-tonal-surface';
	}
</script>

<svelte:head><title>Seats · ShipTrack Pro</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center gap-4">
	<h1 class="h4">Seat inspector</h1>
	<form method="GET" class="flex gap-2">
		<input class="input" type="search" name="q" placeholder="Search domain or email" value={data.search} />
		<button class="btn preset-outlined-surface-200-800" type="submit">Search</button>
	</form>
</div>

{#if form?.message}
	<p class="card preset-tonal-primary mb-4 p-3 text-sm" role="status">{form.message}</p>
{/if}

<div class="table-wrap">
	<table class="table">
		<thead>
			<tr>
				<th>Domain</th><th>Licence</th><th>Environment</th><th>Versions</th>
				<th>Last heartbeat</th><th class="text-right">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.activations as row (row.id)}
				{@const age = heartbeatAge(row.lastHeartbeat)}
				<tr class={row.releasedAt ? 'opacity-50' : ''}>
					<td>
						<span class="font-medium">{row.domain}</span>
						<div class="text-xs opacity-60">{row.siteUrl}</div>
					</td>
					<td>
						<code class="text-sm">{row.keyPrefix}</code>
						<div class="text-xs opacity-60">{row.customerEmail}</div>
					</td>
					<td>
						<span class="badge {envBadge(row.environment)}">{row.environment}</span>
						{#if !row.countsSeat}
							<div class="text-xs opacity-60">no seat</div>
						{/if}
					</td>
					<td class="text-sm">
						<div>plugin {row.pluginVersion}</div>
						<div class="text-xs opacity-60">
							WP {row.wpVersion ?? '—'} · PHP {row.phpVersion ?? '—'}
						</div>
					</td>
					<td class="text-sm">
						{age.label}
						{#if age.stale && !row.releasedAt}
							<span class="badge preset-tonal-warning ml-1 text-xs">stale</span>
						{/if}
					</td>
					<td class="text-right">
						{#if row.releasedAt}
							<span class="badge preset-tonal-surface text-xs">
								released{row.releaseReason ? ` · ${row.releaseReason}` : ''}
							</span>
						{:else}
							<form method="POST" action="?/unbind" use:enhance>
								<input type="hidden" name="licenseId" value={row.licenseId} />
								<input type="hidden" name="installId" value={row.installId} />
								<button class="btn btn-sm preset-filled-error-500" type="submit">Unbind</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="6" class="py-8 text-center opacity-60">No activations match.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
