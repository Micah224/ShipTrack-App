<script lang="ts">
	import { FEATURE_COPY, GROUP_ORDER, featureLabel } from '$lib/features';
	import Icon from '$lib/ui/Icon.svelte';

	interface TierCard {
		tier: string;
		name: string;
		price: string;
		cadence: string;
		pitch: string;
		seats: number;
		features: string[];
		limits: { branches: number | null; auditRetentionDays: number | null };
	}

	let { tiers }: { tiers: TierCard[] } = $props();

	/*
	 * "Everything in Starter, plus": each card lists only what its tier adds,
	 * computed as a set difference against the tier below. Tiers are strict
	 * supersets (domain/tiers.ts), so this is exactly what the upgrade buys.
	 */
	const cards = $derived(
		tiers.map((tier, i) => {
			const below = i > 0 ? tiers[i - 1] : null;
			return {
				...tier,
				heading: below ? `Everything in ${below.name}, plus` : 'What is included',
				adds: tier.features.filter((flag) => !below?.features.includes(flag))
			};
		})
	);

	/** Every flag any tier grants, grouped in the order features.ts defines. */
	const rows = $derived.by(() => {
		const all = [...new Set(tiers.flatMap((t) => t.features))];
		return GROUP_ORDER.flatMap((group) => {
			const flags = all.filter((f) => FEATURE_COPY[f]?.group === group);
			return flags.length ? [{ group, flags }] : [];
		});
	});

	function branches(value: number | null): string {
		return value === null ? 'Unlimited' : String(value);
	}

	function retention(days: number | null): string {
		if (days === null) return 'Full';
		if (days === 0) return 'Current only';
		return `${days} days`;
	}

	/*
	 * The seat classifier's actual rules (domain/site.ts), most common first.
	 * It checks them the other way round: local, managed-host preview, staging,
	 * then anything left is a live site. A buyer sizing a licence needs these
	 * more than a slogan.
	 */
	const environments = [
		{ where: 'A live site', seat: '1 seat', how: 'Any domain not matched below' },
		{ where: 'Staging copy', seat: 'Free', how: 'Starts with staging., dev., test., stage. or preview.' },
		{ where: 'Managed-host preview', seat: 'Free', how: 'WP Engine, Kinsta and Pantheon preview domains' },
		{ where: 'Local install', seat: 'Free', how: 'localhost, private IP ranges, .local, .test, .example' }
	];
</script>

<section id="pricing" class="pricing" aria-labelledby="pricing-title">
	<div class="pricing__head">
		<p class="st-label">[ L06 ] Pricing</p>
		<h2 id="pricing-title" class="st-display pricing__title">Pricing</h2>
		<p class="pricing__sub">
			Every licence includes a year of updates and the public tracking page. Seats are production
			sites; nothing else uses one.
		</p>
	</div>

	<div class="plans">
		{#each cards as card (card.tier)}
			<article class="plan" class:plan--rec={card.tier === 'PROFESSIONAL'} aria-labelledby="plan-{card.tier}">
				<div class="plan__strip">
					{#if card.tier === 'PROFESSIONAL'}<span>Recommended</span>{/if}
				</div>
				<div class="plan__intro">
					<h3 id="plan-{card.tier}" class="plan__name">{card.name}</h3>
					<p class="plan__pitch">{card.pitch}</p>
					<p class="plan__price">
						<span class="plan__amount">{card.price}</span>
						<span class="st-label">{card.cadence}</span>
					</p>
				</div>
				<dl class="plan__specs">
					<div>
						<dt>Production sites</dt>
						<dd class="st-num">{card.seats}</dd>
					</div>
					<div>
						<dt>Custom branches</dt>
						<dd class="st-num">{branches(card.limits.branches)}</dd>
					</div>
					<div>
						<dt>Audit retention</dt>
						<dd>{retention(card.limits.auditRetentionDays)}</dd>
					</div>
				</dl>
				<div class="plan__list">
					<p class="plan__listhead">{card.heading}</p>
					<ul>
						{#each card.adds as flag (flag)}
							<li><Icon name="check" size={16} />{featureLabel(flag)}</li>
						{/each}
					</ul>
				</div>
			</article>
		{/each}
	</div>

	<div class="seats">
		<h3 class="seats__title">How seats work</h3>
		<div class="seats__table" role="table" aria-label="Which installs use a seat">
			<div class="seats__row seats__row--head" role="row">
				<span role="columnheader" class="st-label">Where the plugin runs</span>
				<span role="columnheader" class="st-label">Seat</span>
				<span role="columnheader" class="st-label">How it is recognised</span>
			</div>
			{#each environments as env (env.where)}
				<div class="seats__row" role="row">
					<span role="cell" class="seats__where">{env.where}</span>
					<span role="cell" class="seats__seat" class:seats__seat--free={env.seat === 'Free'}>{env.seat}</span>
					<span role="cell" class="seats__how">{env.how}</span>
				</div>
			{/each}
		</div>
		<p class="seats__foot">Retiring a site? Free its seat yourself from the licence portal.</p>
	</div>

	<div class="compare">
		<h3 id="compare-title" class="compare__title">What each tier includes</h3>
		<p class="compare__sub">
			Generated from the entitlement matrix the licence server issues from, so this table cannot
			disagree with what your site actually receives.
		</p>
		<!-- Scrolls sideways on a phone, so it takes focus for keyboard scrolling. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="compare__wrap" tabindex="0" role="region" aria-labelledby="compare-title">
			<table class="compare__table">
				<thead>
					<tr>
						<th scope="col">Capability</th>
						{#each tiers as tier (tier.tier)}
							<th scope="col">{tier.name}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.group)}
						<tr class="compare__group">
							<th colspan={tiers.length + 1} scope="colgroup">{row.group}</th>
						</tr>
						{#each row.flags as flag (flag)}
							<tr>
								<th scope="row">{featureLabel(flag)}</th>
								{#each tiers as tier (tier.tier)}
									<td>
										{#if tier.features.includes(flag)}
											<span class="yes"><Icon name="check" size={16} label="Included" /></span>
										{:else}
											<span class="no" aria-hidden="true">—</span>
											<span class="st-vh">Not included</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>

<style>
	.pricing {
		padding: 6.5rem 1.5rem 5rem;
	}
	.pricing__head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 3.5rem;
		text-align: center;
	}
	.pricing__title {
		margin: 0;
		font-size: clamp(3.2rem, 9vw, 7.2rem);
	}
	.pricing__sub {
		max-width: 34rem;
		margin: 0;
		color: var(--ink-soft);
	}

	.plans {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.plan {
		display: flex;
		flex-direction: column;
	}
	.plan + .plan {
		border-left: 1px dashed var(--rule);
	}
	.plan__strip {
		height: 26px;
		display: grid;
		place-items: center;
		font-family: var(--st-font-mono);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.plan--rec .plan__strip {
		background: var(--mint);
		color: var(--mint-ink);
	}
	.plan__intro {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 1.8rem 1.5rem 1.6rem;
		text-align: center;
		border-bottom: 1px dashed var(--rule);
	}
	.plan__name {
		margin: 0;
		font-family: var(--st-font-display);
		font-stretch: 112%;
		font-size: 1.9rem;
		font-weight: 700;
	}
	.plan__pitch {
		min-height: 3em;
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.95rem;
	}
	.plan__price {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0.4rem 0 0;
	}
	.plan__amount {
		font-size: 2.2rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.plan__specs {
		margin: 0;
		padding: 1.1rem 1.5rem;
		border-bottom: 1px dashed var(--rule);
	}
	.plan__specs div {
		display: flex;
		justify-content: space-between;
		padding: 0.3rem 0;
		font-size: 0.95rem;
	}
	.plan__specs dt {
		color: var(--ink-soft);
	}
	.plan__specs dd {
		margin: 0;
		font-weight: 600;
	}
	.plan__list {
		padding: 1.3rem 1.5rem 1.8rem;
	}
	.plan__listhead {
		margin: 0 0 0.8rem;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.plan__list ul {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.plan__list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		color: var(--ink-soft);
	}
	.plan__list li :global(svg) {
		color: var(--ink);
	}

	.seats {
		margin-top: 4rem;
	}
	.seats__title,
	.compare__title {
		margin: 0 0 1rem;
		font-family: var(--st-font-display);
		font-stretch: 110%;
		font-size: 1.5rem;
		font-weight: 700;
	}
	.seats__table {
		border-top: 1px solid var(--rule);
	}
	.seats__row {
		display: grid;
		grid-template-columns: 1.1fr 0.5fr 2fr;
		gap: 1rem;
		padding: 0.85rem 0;
		border-bottom: 1px dashed var(--rule);
	}
	.seats__where {
		font-weight: 600;
	}
	.seats__seat {
		font-family: var(--st-font-mono);
		font-size: 0.9rem;
	}
	.seats__seat--free {
		justify-self: start;
		padding: 0 6px;
		background: var(--mint);
		color: var(--mint-ink);
	}
	.seats__how {
		color: var(--ink-soft);
	}
	.seats__foot {
		margin: 1rem 0 0;
		color: var(--ink-soft);
		font-size: 0.95rem;
	}

	.compare {
		margin-top: 4rem;
	}
	.compare__sub {
		max-width: 40rem;
		margin: 0 0 1.5rem;
		color: var(--ink-soft);
		font-size: 0.95rem;
	}
	.compare__wrap {
		overflow-x: auto;
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.compare__table {
		width: 100%;
		min-width: 36rem;
		border-collapse: collapse;
		font-size: 0.95rem;
	}
	.compare__table th,
	.compare__table td {
		padding: 0.7rem 1rem;
		border-bottom: 1px dashed var(--rule-soft);
		text-align: center;
		font-weight: 400;
	}
	.compare__table thead th {
		border-bottom: 1px solid var(--rule);
		font-family: var(--st-font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.compare__table th[scope='row'],
	.compare__table thead th:first-child {
		text-align: left;
	}
	.compare__group th {
		padding-top: 1.2rem;
		background: var(--bg);
		font-family: var(--st-font-mono);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-align: left;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.yes {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		background: var(--mint);
		color: var(--mint-ink);
	}
	.no {
		color: var(--ink-faint);
	}

	@media (max-width: 860px) {
		.pricing {
			padding: 4.5rem 1.25rem 4rem;
		}
		.plans {
			grid-template-columns: 1fr;
		}
		.plan + .plan {
			border-left: 0;
			border-top: 1px solid var(--rule);
		}
		.seats__row {
			grid-template-columns: 1fr auto;
		}
		.seats__how {
			grid-column: 1 / -1;
		}
		/* Visually hidden, not display: none, so the column keeps its header for screen readers. */
		.seats__row--head span:last-child {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
