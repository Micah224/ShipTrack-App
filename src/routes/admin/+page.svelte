<script lang="ts">
	import { resolve } from '$app/paths';
	import BarList from '$lib/components/console/BarList.svelte';
	import PageHead from '$lib/components/console/PageHead.svelte';
	import StateChip, { type Tone } from '$lib/components/console/StateChip.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	let { data } = $props();

	const stats = $derived(data.stats);
	const utilisation = $derived(
		stats.seats.capacity > 0 ? Math.round((stats.seats.used / stats.seats.capacity) * 100) : 0
	);
	const totalInstalls = $derived(stats.installs.production + stats.installs.nonProduction);

	// Tiers in their own order, cheapest first, never re-sorted by count: a bar
	// that moves when the numbers change reads as a different tier.
	const TIER_ORDER = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
	const tierRows = $derived(
		[...stats.byTier]
			.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
			.map((row) => ({ key: row.tier, label: row.tier, value: row.count }))
	);

	// The version the chart is about is the most recently published one.
	const versionRows = $derived(
		stats.versions.map((row) => {
			const latest = row.version === stats.latestRelease?.version;
			return {
				key: row.version,
				label: row.version,
				value: row.installs,
				emphasis: latest,
				tag: latest ? 'latest' : undefined
			};
		})
	);

	/*
	 * Attention tiles: each count says whether anything needs a look, with the
	 * tone reserved for state and always paired with a glyph and a word.
	 */
	interface Tile {
		key: string;
		label: string;
		count: number;
		detail: string;
		tone: Tone;
		path: '/admin/seats' | '/admin/licenses';
	}
	const tiles = $derived<Tile[]>([
		{
			key: 'stale',
			label: 'Stale installs',
			count: stats.installs.stale,
			detail: 'No heartbeat in three days. Their seats are reclaimed if they stay silent.',
			tone: 'warn',
			path: '/admin/seats'
		},
		{
			key: 'suspended',
			label: 'Suspended',
			count: stats.licenses.suspended,
			detail: 'Refused on the next heartbeat, with no grace period.',
			tone: 'warn',
			path: '/admin/licenses'
		},
		{
			key: 'expired',
			label: 'Expired',
			count: stats.licenses.expired,
			detail: 'Past expiry and past grace. Public tracking pages keep working.',
			tone: 'crit',
			path: '/admin/licenses'
		},
		{
			key: 'revoked',
			label: 'Revoked',
			count: stats.licenses.revoked,
			detail: 'Refused outright on the next heartbeat, with no grace period.',
			tone: 'crit',
			path: '/admin/licenses'
		}
	]);

	function published(value: Date | string): string {
		return new Date(value).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Overview · ShipTrack Pro</title></svelte:head>

<PageHead
	code="C01"
	title="Overview"
	lede="Licences, seats and releases as the licence server sees them now."
/>

<section class="figures st-panel" aria-label="Key figures">
	<div class="figure">
		<p class="st-label">Active licences</p>
		<p class="figure__value">{stats.licenses.active}</p>
		<p class="figure__sub">{stats.licenses.total} issued in total</p>
	</div>

	<div class="figure">
		<p class="st-label">Seat utilisation</p>
		<p class="figure__value">{utilisation}<span class="figure__unit">%</span></p>
		<div
			class="meter"
			role="meter"
			aria-label="Production seats in use"
			aria-valuenow={stats.seats.used}
			aria-valuemin={0}
			aria-valuemax={Math.max(stats.seats.capacity, stats.seats.used)}
		>
			<span style:width="{Math.min(utilisation, 100)}%"></span>
		</div>
		<p class="figure__sub">{stats.seats.used} of {stats.seats.capacity} production seats</p>
	</div>

	<div class="figure">
		<p class="st-label">Live installs</p>
		<p class="figure__value">{totalInstalls}</p>
		<p class="figure__sub">
			{stats.installs.production} production · {stats.installs.nonProduction} staging or local
		</p>
	</div>

	<div class="figure">
		<p class="st-label">Latest release</p>
		{#if stats.latestRelease}
			<p class="figure__value figure__value--code">{stats.latestRelease.version}</p>
			<p class="figure__sub">Published {published(stats.latestRelease.publishedAt)}</p>
		{:else}
			<p class="figure__value figure__value--none">None yet</p>
			<p class="figure__sub">Nothing has been ingested from GitHub.</p>
		{/if}
	</div>
</section>

<div class="charts">
	<section class="st-panel" aria-labelledby="adoption-title">
		<div class="st-panel__head">
			<h2 id="adoption-title" class="st-panel__title">Version adoption</h2>
			<span class="charts__meta st-label">{totalInstalls} live</span>
		</div>
		<div class="st-panel__body">
			{#if versionRows.length === 0}
				<p class="empty">No installs have reported in yet.</p>
			{:else}
				<BarList rows={versionRows} total={totalInstalls} unit={['install', 'installs']} label="Installs by plugin version" />
				{#if versionRows.some((row) => row.emphasis)}
					<p class="key"><i aria-hidden="true"></i>The most recently published release</p>
				{/if}
			{/if}
		</div>
	</section>

	<section class="st-panel" aria-labelledby="tiers-title">
		<div class="st-panel__head">
			<h2 id="tiers-title" class="st-panel__title">Licences by tier</h2>
			<span class="charts__meta st-label">{stats.licenses.total} issued</span>
		</div>
		<div class="st-panel__body">
			{#if tierRows.length === 0}
				<p class="empty">No licences have been minted yet.</p>
			{:else}
				<BarList rows={tierRows} unit={['licence', 'licences']} label="Licences by tier" />
			{/if}
		</div>
	</section>
</div>

<section class="attention" aria-labelledby="attention-title">
	<h2 id="attention-title" class="st-label attention__title">Attention</h2>
	<ul class="tiles">
		{#each tiles as tile (tile.key)}
			<li class="tile" data-live={tile.count > 0 ? tile.tone : undefined}>
				<a href={resolve(tile.path)} class="tile__link">
					<span class="tile__top">
						<span class="tile__label">{tile.label}</span>
						<Icon name="arrow" size={16} />
					</span>
					<span class="tile__count">{tile.count}</span>
					<span class="tile__detail">{tile.detail}</span>
					<span class="tile__state">
						{#if tile.count > 0}
							<StateChip tone={tile.tone} label="Needs a look" />
						{:else}
							<StateChip tone="good" label="Clear" />
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<p class="footnote">
	Revenue figures are not shown: no table records what a licence was sold for, so any ARR or MRR
	here would be invented. Adding a price to the licence, or restoring an orders table, is what makes
	that number real.
</p>

<style>
	.figures {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		padding: 1.4rem 1.4rem 1.5rem;
	}
	.figure + .figure {
		border-left: 1px solid var(--rule);
	}
	.figure p {
		margin: 0;
	}
	/* Stat values in the body face with proportional figures: read, not scanned in a column. */
	.figure__value {
		font-size: 2.6rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.figure__value--code {
		font-family: var(--font-mono);
		font-size: 2.1rem;
		font-weight: 700;
		letter-spacing: 0;
	}
	.figure__value--none {
		color: var(--ink-soft);
		font-size: 1.6rem;
	}
	.figure__unit {
		margin-left: 0.1em;
		color: var(--ink-soft);
		font-size: 0.55em;
	}
	.figure__sub {
		color: var(--ink-faint);
		font-size: 13px;
	}
	.meter {
		height: 8px;
		background: var(--con-line);
	}
	.meter span {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: 0 4px 4px 0;
		background: var(--con-good);
	}

	.charts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}
	.charts__meta {
		margin-left: auto;
		font-size: 11px;
	}
	.empty {
		margin: 0;
		color: var(--ink-soft);
	}
	.key {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.25rem 0 0;
		color: var(--ink-faint);
		font-size: 13px;
	}
	.key i {
		width: 12px;
		height: 12px;
		border-radius: 0 3px 3px 0;
		background: var(--con-good);
	}

	.attention {
		margin-top: 2.25rem;
	}
	.attention__title {
		margin: 0 0 0.9rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* Corner registration marks, the reference's framing device for a tile. */
	.tile {
		position: relative;
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.tile::before,
	.tile::after {
		content: '';
		position: absolute;
		width: 7px;
		height: 7px;
		background: var(--con-dim);
	}
	.tile::before {
		top: -4px;
		left: -4px;
	}
	.tile::after {
		right: -4px;
		bottom: -4px;
	}
	.tile[data-live='warn']::before,
	.tile[data-live='warn']::after {
		background: var(--con-warn);
	}
	.tile[data-live='crit']::before,
	.tile[data-live='crit']::after {
		background: var(--con-crit);
	}
	.tile__link {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		height: 100%;
		padding: 1.2rem 1.25rem 1.3rem;
		color: var(--ink);
		text-decoration: none;
		transition: background-color 140ms var(--ease-out);
	}
	.tile__link:hover {
		background: var(--sheet-2);
	}
	.tile__top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--ink-soft);
	}
	.tile__label {
		font: 400 12px/1.2 var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.tile__count {
		font-size: 2.2rem;
		font-weight: 600;
		line-height: 1;
	}
	.tile__detail {
		flex: 1;
		color: var(--ink-soft);
		font-size: 13px;
	}

	.footnote {
		max-width: 52rem;
		margin: 2.5rem 0 0;
		padding-top: 1rem;
		border-top: 1px dashed var(--rule);
		color: var(--ink-faint);
		font-size: 13px;
	}

	@media (max-width: 1100px) {
		.figures,
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.figure:nth-child(3) {
			border-left: 0;
		}
		.figure:nth-child(n + 3) {
			border-top: 1px solid var(--rule);
		}
		.charts {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 520px) {
		.figures,
		.tiles {
			grid-template-columns: 1fr;
		}
		.figure + .figure {
			border-left: 0;
			border-top: 1px solid var(--rule);
		}
		.figure__value {
			font-size: 2.2rem;
		}
	}
</style>
