<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHead from '$lib/components/console/PageHead.svelte';
	import SearchBar from '$lib/components/console/SearchBar.svelte';
	import StateChip, { type Tone } from '$lib/components/console/StateChip.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	let { data } = $props();

	// Refusals and destruction read as critical, disclosure and capacity as a
	// warning; everything else is routine and stays neutral.
	function tone(action: string): Tone {
		if (
			action.includes('failed') ||
			action.includes('blocked') ||
			action.includes('denied') ||
			action.includes('revoked')
		) {
			return 'crit';
		}
		if (action.includes('revealed') || action.includes('seat_limit')) return 'warn';
		return 'neutral';
	}

	// Built by hand rather than with URLSearchParams: the linter flags the
	// mutable built-in inside a component, and two encoded pairs do not need it.
	function query(page: number): string {
		return data.search ? `q=${encodeURIComponent(data.search)}&page=${page}` : `page=${page}`;
	}

	function when(value: Date | string): { date: string; time: string } {
		const d = new Date(value);
		return {
			date: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
			time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
		};
	}
</script>

<svelte:head><title>Audit · ShipTrack Pro</title></svelte:head>

<PageHead
	code="C05"
	title="Audit log"
	lede="Console actions, activations and refusals, seat changes and releases, as the licence server recorded them. Newest first."
>
	<SearchBar value={data.search} placeholder="Action or actor" label="Search the audit log" />
</PageHead>

<div class="st-table-wrap">
	<table class="st-table st-table--cards">
		<thead>
			<tr>
				<th scope="col">When</th>
				<th scope="col">Action</th>
				<th scope="col">Actor</th>
				<th scope="col">Details</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as entry (entry.id)}
				{@const at = when(entry.createdAt)}
				<tr>
					<td data-label="When">
						<span class="when st-num">
							<span>{at.date}</span>
							<span class="st-faint">{at.time}</span>
						</span>
					</td>
					<td data-label="Action">
						<StateChip tone={tone(entry.action)} label={entry.action} raw />
					</td>
					<td data-label="Actor"><span class="actor">{entry.actor}</span></td>
					<td data-label="Details">
						{#if entry.details && Object.keys(entry.details).length > 0}
							<code class="st-code details">{JSON.stringify(entry.details)}</code>
						{:else}
							<span class="st-faint">None</span>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="4" class="none">
						{data.search ? `Nothing matches “${data.search}”.` : 'Nothing recorded yet.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<nav class="pager" aria-label="Audit pages">
	{#if data.page > 1}
		<a class="st-btn st-btn--ghost st-btn--sm" href={resolve(`/admin/audit?${query(data.page - 1)}`)}>
			<span class="flip"><Icon name="arrow" size={14} /></span> Newer
		</a>
	{/if}
	<span class="st-label">Page {data.page}</span>
	{#if data.hasNext}
		<a class="st-btn st-btn--ghost st-btn--sm" href={resolve(`/admin/audit?${query(data.page + 1)}`)}>
			Older <Icon name="arrow" size={14} />
		</a>
	{/if}
</nav>

<style>
	.when {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		font-size: 13px;
		white-space: nowrap;
	}
	.actor {
		overflow-wrap: anywhere;
	}
	.details {
		display: block;
		max-width: 38rem;
		color: var(--ink-soft);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.none {
		padding: 3rem 1rem;
		color: var(--ink-soft);
		text-align: center;
	}
	.pager {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.flip {
		display: inline-grid;
		transform: scaleX(-1);
	}

	@media (max-width: 760px) {
		.when {
			flex-direction: row;
			gap: 0.5rem;
		}
		.none {
			text-align: left;
		}
	}
</style>
