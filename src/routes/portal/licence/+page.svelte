<script lang="ts">
	import StateChip, { type Tone } from '$lib/components/console/StateChip.svelte';
	import { FEATURE_COPY, GROUP_ORDER, featureLabel } from '$lib/features';
	import Icon from '$lib/ui/Icon.svelte';

	let { data, form } = $props();

	const licence = $derived(data.missing ? null : data.licence);
	const installs = $derived(data.missing ? [] : data.installs);

	const live = $derived(installs.filter((i) => i.releasedAt === null));
	const released = $derived(installs.filter((i) => i.releasedAt !== null));

	const grouped = $derived.by(() => {
		if (!licence) return [];
		return GROUP_ORDER.flatMap((group) => {
			const flags = licence.features.filter((f) => FEATURE_COPY[f]?.group === group);
			return flags.length ? [{ group, flags }] : [];
		});
	});

	/*
	 * The state a customer sees is the one the plugin computes, not the raw
	 * status, and it is always a glyph and a word as well as a colour.
	 */
	const stateCopy: Record<string, { tone: Tone; says: string }> = {
		ACTIVE: { tone: 'good', says: 'Your licence is active.' },
		GRACE: {
			tone: 'warn',
			says: 'Your sites are running on the grace period. Renew to avoid interruption.'
		},
		EXPIRED: {
			tone: 'crit',
			says: 'This licence has expired. Existing tracking pages keep working; new shipments do not.'
		},
		SUSPENDED: { tone: 'warn', says: 'This licence is suspended.' },
		REVOKED: { tone: 'crit', says: 'This licence has been revoked.' }
	};
	const state = $derived(licence ? stateCopy[licence.state] : undefined);

	const seatShare = $derived(
		licence && licence.maxSeats > 0
			? Math.min(100, Math.round((licence.seatsUsed / licence.maxSeats) * 100))
			: 0
	);

	/*
	 * A past expiry date reads as history, not a deadline: "Expired", then when
	 * the grace period ends, counted the way licenseState() counts it (UTC days).
	 */
	const expiry = $derived.by(() => {
		if (!licence?.expiresAt) return { label: 'Expires', sub: null };
		const expires = new Date(licence.expiresAt);
		// UTC days are always 86,400,000 ms, so this matches setUTCDate(+days).
		const graceEnds = new Date(expires.getTime() + licence.gracePeriodDays * 86_400_000);
		const now = Date.now();
		if (expires.getTime() >= now) {
			return { label: 'Expires', sub: `Then ${licence.gracePeriodDays} days' grace` };
		}
		return {
			label: 'Expired',
			sub: `Grace ${graceEnds.getTime() >= now ? 'ends' : 'ended'} ${when(graceEnds)}`
		};
	});

	function when(value: string | Date | null): string {
		if (!value) return 'Never';
		return new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function staleness(lastHeartbeat: string | Date | null): string {
		if (!lastHeartbeat) return 'Never checked in';
		const days = Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 86_400_000);
		if (days <= 0) return 'Checked in today';
		if (days === 1) return 'Checked in yesterday';
		return `Checked in ${days} days ago`;
	}
</script>

<svelte:head>
	<title>Your licence · Licence portal · ShipTrack Pro</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if data.missing}
	<section class="gone" aria-labelledby="gone-title">
		<p class="st-label">[ Licence portal ]</p>
		<h1 id="gone-title" class="st-display gone__title">This licence is no longer on file</h1>
		<p class="gone__body">
			Your session refers to a licence that has since been removed.
			<!--
				Not the key: a customer who has lost it cannot quote it, and a removed
				licence cannot be revealed. The email it was issued to is always known,
				and it is what the console searches licences by.
			-->
			{#if data.supportEmail}
				Email <a href="mailto:{data.supportEmail}">{data.supportEmail}</a> from, or naming, the address
				the licence was issued to.
			{:else}
				Ask whoever sold you the licence, naming the email address it was issued to.
			{/if}
		</p>
	</section>
{:else if licence}
	<header class="head">
		<p class="st-label">[ Licence portal ] Your licence</p>
		<h1 class="st-display head__title">Your licence</h1>
		<!-- Only the prefix ever reaches the browser: it is what support asks for. -->
		<p class="head__key st-code">{licence.keyPrefix}-••••-••••-••••</p>
	</header>

	{#if form?.released}
		<p class="notice notice--good" role="status">
			<Icon name="check" size={16} />
			Freed the seat used by {form.released}. It is available immediately.
		</p>
	{:else if form?.message}
		<p class="notice notice--crit" role="alert">
			<Icon name="warn" size={16} />
			{form.message}
		</p>
	{/if}

	<section class="status" aria-labelledby="status-title">
		<h2 id="status-title" class="st-vh">Licence status</h2>
		<div class="status__top">
			{#if state}<StateChip tone={state.tone} label={licence.state} />{/if}
			<span class="st-chip">{licence.tier}</span>
			<p class="status__says">{state?.says ?? ''}</p>
		</div>

		<dl class="figures">
			<div class="figure">
				<dt class="st-label">Production seats</dt>
				<dd class="figure__value">{licence.seatsUsed} <span>of {licence.maxSeats}</span></dd>
				<dd class="figure__meter">
					<span
						class="meter"
						role="meter"
						aria-label="Production seats in use"
						aria-valuenow={licence.seatsUsed}
						aria-valuemin={0}
						aria-valuemax={Math.max(1, licence.maxSeats, licence.seatsUsed)}
						aria-valuetext="{licence.seatsUsed} of {licence.maxSeats} production seats"
					>
						<span style:width="{seatShare}%"></span>
					</span>
				</dd>
			</div>
			<div class="figure">
				<dt class="st-label">{expiry.label}</dt>
				<dd class="figure__value figure__value--text">{when(licence.expiresAt)}</dd>
				{#if expiry.sub}
					<dd class="figure__sub">{expiry.sub}</dd>
				{/if}
			</div>
			<div class="figure">
				<dt class="st-label">Custom branches</dt>
				<dd class="figure__value">{licence.limits.branches ?? 'Unlimited'}</dd>
			</div>
		</dl>
	</section>

	<section class="block" aria-labelledby="sites-title">
		<div class="block__head">
			<h2 id="sites-title" class="st-display block__title">Your sites</h2>
			<p class="block__lede">
				Only production sites use a seat. Staging, local and managed-host previews are free, and a
				site that stops checking in for {data.reclaimAfterDays} days releases its seat automatically.
			</p>
		</div>

		{#if live.length === 0}
			<div class="empty">
				<p>
					No sites are using this licence yet. Paste your key into <strong>ShipTrack Pro → Licence</strong>
					in your WordPress admin.
				</p>
			</div>
		{:else}
			<!-- Scrolls sideways when a row is wide, so it takes focus for keyboard scrolling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="st-table-wrap" tabindex="0" role="region" aria-label="Your sites">
				<table class="st-table st-table--cards">
					<thead>
						<tr>
							<th scope="col">Site</th>
							<th scope="col">Environment</th>
							<th scope="col">Plugin</th>
							<th scope="col">Last seen</th>
							<th scope="col" class="st-end"><span class="st-vh">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each live as install (install.id)}
							<tr>
								<td data-label="Site"><span class="site">{install.domain}</span></td>
								<td data-label="Environment">
									<div class="env">
										<span
											class="st-chip"
											data-tone={install.environment === 'PRODUCTION' ? 'accent' : undefined}
										>
											{install.environment}
										</span>
										{#if !install.countsSeat}<span class="sub">No seat</span>{/if}
									</div>
								</td>
								<td data-label="Plugin">
									<div>
										<span class="st-code">{install.pluginVersion ?? 'Unknown'}</span>
										{#if install.wpVersion}<div class="sub">WordPress {install.wpVersion}</div>{/if}
									</div>
								</td>
								<td data-label="Last seen"><span class="sub sub--ink">{staleness(install.lastHeartbeat)}</span></td>
								<td class="st-end">
									{#if install.countsSeat}
										<form method="POST" action="?/release">
											<input type="hidden" name="activation_id" value={install.id} />
											<button class="st-btn st-btn--ghost st-btn--sm" type="submit">
												Free this seat
											</button>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if released.length > 0}
			<details class="released">
				<summary>
					<span class="released__chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
					{released.length} released site{released.length === 1 ? '' : 's'}
				</summary>
				<ul>
					{#each released as install (install.id)}
						<li>
							<span class="site">{install.domain}</span>
							<span class="sub">Released {when(install.releasedAt)}</span>
							{#if install.releaseReason}<span class="st-chip">{install.releaseReason}</span>{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>

	<section class="block" aria-labelledby="includes-title">
		<div class="block__head">
			<h2 id="includes-title" class="st-display block__title">What your licence includes</h2>
		</div>
		<div class="groups">
			{#each grouped as row (row.group)}
				<div class="group">
					<h3 class="st-label group__title">{row.group}</h3>
					<ul>
						{#each row.flags as flag (flag)}
							<li><Icon name="check" size={16} />{featureLabel(flag)}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.75rem;
	}
	.head__title {
		margin: 0;
		font-size: clamp(2.2rem, 4.4vw, 3.4rem);
		font-stretch: 112%;
	}
	.head__key {
		margin: 0;
		color: var(--ink-soft);
		font-size: 14px;
		letter-spacing: 0.06em;
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 1.25rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--rule);
		border-left-width: 4px;
		background: var(--sheet);
		font-size: 14px;
	}
	.notice--good {
		border-color: color-mix(in oklab, var(--st-good-ink) 45%, transparent);
		color: var(--st-good-ink);
	}
	.notice--crit {
		border-color: var(--st-crit-line);
		background: var(--st-crit-bg);
		color: var(--st-crit-ink);
	}

	.status {
		border: 1px solid var(--ink);
		background: var(--sheet);
	}
	.status__top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 0.75rem;
		padding: 1.1rem 1.4rem;
		border-bottom: 1px dashed var(--rule);
	}
	.status__says {
		margin: 0;
		color: var(--ink-soft);
		font-size: 14px;
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.3rem 1.4rem 1.4rem;
	}
	.figure + .figure {
		border-left: 1px solid var(--rule);
	}
	.figure dd {
		margin: 0;
	}
	/* Read, not scanned in a column: the body face with proportional figures. */
	.figure__value {
		font-size: 2.2rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.figure__value span {
		color: var(--ink-soft);
		font-size: 0.55em;
		font-weight: 500;
		letter-spacing: 0;
	}
	.figure__value--text {
		font-size: 1.6rem;
	}
	.figure__sub {
		color: var(--ink-faint);
		font-size: 13px;
	}
	.meter {
		display: block;
		height: 8px;
		background: var(--rule-soft);
	}
	.meter span {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: 0 4px 4px 0;
		background: var(--ink);
	}

	.block {
		margin-top: 3rem;
	}
	.block__head {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.25rem;
	}
	.block__title {
		margin: 0;
		font-size: clamp(1.6rem, 3vw, 2.2rem);
		font-stretch: 112%;
	}
	.block__lede {
		max-width: 46rem;
		margin: 0;
		color: var(--ink-soft);
	}

	.empty {
		padding: 1.5rem;
		border: 1px dashed var(--rule);
		background: var(--sheet);
		color: var(--ink-soft);
	}
	.empty p {
		margin: 0;
	}
	.empty strong {
		color: var(--ink);
		font-weight: 600;
	}

	.site {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.env {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.sub {
		color: var(--ink-faint);
		font-size: 13px;
	}
	.sub--ink {
		color: var(--ink-soft);
		font-size: 14px;
	}
	/* A second line under a value, set apart so it never reads as the next row. */
	div.sub {
		margin-top: 0.2rem;
	}

	.released {
		margin-top: 0.75rem;
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.released summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.85rem 1rem;
		cursor: pointer;
		font-size: 14px;
		font-weight: 500;
		list-style: none;
	}
	.released summary::-webkit-details-marker {
		display: none;
	}
	.released__chev {
		display: grid;
		color: var(--ink-faint);
		transform: rotate(-90deg);
		transition: transform 160ms var(--st-ease-out);
	}
	.released[open] .released__chev {
		transform: none;
	}
	.released ul {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0.25rem 1rem 1rem 2.5rem;
		list-style: none;
	}
	.released li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
	}
	.released .site {
		font-weight: 500;
		text-decoration: line-through;
		text-decoration-color: var(--ink-faint);
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		border-top: 1px solid var(--rule);
		border-left: 1px solid var(--rule);
	}
	.group {
		padding: 1.2rem 1.25rem 1.4rem;
		border-right: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		background: var(--sheet);
	}
	.group__title {
		margin: 0 0 0.8rem;
	}
	.group ul {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.group li {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 14px;
	}
	.group li :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--st-good-ink);
	}

	.gone {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 40rem;
		padding: 1.75rem;
		border: 1px solid var(--st-crit-line);
		border-left-width: 4px;
		background: var(--sheet);
	}
	.gone__title {
		margin: 0;
		font-size: clamp(1.7rem, 3.4vw, 2.3rem);
		font-stretch: 112%;
	}
	.gone__body {
		margin: 0;
		color: var(--ink-soft);
	}
	.gone__body a {
		color: var(--ink);
		text-underline-offset: 3px;
	}

	@media (max-width: 760px) {
		.figures {
			grid-template-columns: 1fr;
		}
		.figure + .figure {
			border-left: 0;
			border-top: 1px solid var(--rule);
		}
		.figure__value {
			font-size: 1.9rem;
		}
		.released ul {
			padding-left: 1rem;
		}
	}
</style>
