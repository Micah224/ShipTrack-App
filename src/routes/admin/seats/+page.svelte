<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHead from '$lib/components/console/PageHead.svelte';
	import SearchBar from '$lib/components/console/SearchBar.svelte';
	import StateChip from '$lib/components/console/StateChip.svelte';

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

	/*
	 * Counts over the rows on screen, so they follow the search. Labelled as
	 * "listed" because the list is capped and a search narrows it; these are
	 * not totals for the whole fleet (the overview has those).
	 */
	const bound = $derived(data.activations.filter((row) => !row.releasedAt));
	const counting = $derived(bound.filter((row) => row.countsSeat).length);
	const stale = $derived(
		bound.filter((row) => Date.now() - new Date(row.lastHeartbeat).getTime() > STALE_MS).length
	);
</script>

<svelte:head><title>Seats · ShipTrack Pro</title></svelte:head>

<PageHead
	code="C03"
	title="Seat inspector"
	lede="Every site that has activated a licence. Only production sites hold a seat."
>
	<SearchBar value={data.search} placeholder="Domain or email" label="Search activations" />
</PageHead>

<dl class="tally st-panel">
	<div>
		<dt class="st-label">Bound, listed</dt>
		<dd>{bound.length}</dd>
	</div>
	<div>
		<dt class="st-label">Holding a seat</dt>
		<dd>{counting}</dd>
	</div>
	<div>
		<dt class="st-label">No seat</dt>
		<dd>{bound.length - counting}</dd>
	</div>
	<div>
		<dt class="st-label">Stale</dt>
		<dd>{stale}</dd>
	</div>
</dl>

{#if form?.message}
	<p class="notice" role="status">{form.message}</p>
{/if}

<div class="st-table-wrap">
	<table class="st-table st-table--cards">
		<thead>
			<tr>
				<th scope="col">Domain</th>
				<th scope="col">Licence</th>
				<th scope="col">Environment</th>
				<th scope="col">Versions</th>
				<th scope="col">Last heartbeat</th>
				<th scope="col" class="st-end">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.activations as row (row.id)}
				{@const age = heartbeatAge(row.lastHeartbeat)}
				<tr class:released={!!row.releasedAt}>
					<td data-label="Domain">
						<div>
							<span class="domain">{row.domain}</span>
							<div class="sub">{row.siteUrl}</div>
						</div>
					</td>
					<td data-label="Licence">
						<div>
							<code class="st-code">{row.keyPrefix}</code>
							<div class="sub">{row.customerEmail}</div>
						</div>
					</td>
					<td data-label="Environment">
						<div class="env">
							<span class="st-chip" data-tone={row.environment === 'PRODUCTION' ? 'accent' : undefined}>
								{row.environment}
							</span>
							{#if !row.countsSeat}<span class="sub">No seat</span>{/if}
						</div>
					</td>
					<td data-label="Versions">
						<div>
							<span class="st-code">plugin {row.pluginVersion}</span>
							<div class="sub">WP {row.wpVersion ?? 'unknown'} · PHP {row.phpVersion ?? 'unknown'}</div>
						</div>
					</td>
					<td data-label="Heartbeat">
						<div class="beat">
							<span class="st-num">{age.label}</span>
							{#if age.stale && !row.releasedAt}<StateChip tone="warn" label="Stale" />{/if}
						</div>
					</td>
					<td class="st-end">
						{#if row.releasedAt}
							<span class="st-chip">
								Released{row.releaseReason ? ` · ${row.releaseReason}` : ''}
							</span>
						{:else}
							<form method="POST" action="?/unbind" use:enhance>
								<input type="hidden" name="licenseId" value={row.licenseId} />
								<input type="hidden" name="installId" value={row.installId} />
								<button class="st-btn st-btn--danger st-btn--sm" type="submit">Unbind</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="none">
						{data.search ? `No activations match “${data.search}”.` : 'No site has activated a licence yet.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.tally {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0 0 1.25rem;
	}
	.tally div {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 1rem 1.25rem;
	}
	.tally div + div {
		border-left: 1px solid var(--rule);
	}
	.tally dd {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1;
	}
	.notice {
		margin: 0 0 1.25rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--rule);
		border-left: 4px solid var(--ink-soft);
		background: var(--sheet);
		font-size: 14px;
	}
	.domain {
		font-weight: 600;
	}
	.sub {
		margin-top: 0.15rem;
		color: var(--ink-faint);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.env,
	.beat {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	/* A released row stays on the record, set back rather than removed. */
	.released td {
		color: var(--ink-faint);
	}
	.released .domain {
		font-weight: 400;
		text-decoration: line-through;
		text-decoration-color: var(--con-dim);
	}
	.none {
		padding: 3rem 1rem;
		color: var(--ink-soft);
		text-align: center;
	}

	@media (max-width: 760px) {
		.tally {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.tally div:nth-child(3) {
			border-left: 0;
		}
		.tally div:nth-child(n + 3) {
			border-top: 1px solid var(--rule);
		}
		.none {
			text-align: left;
		}
	}
</style>
