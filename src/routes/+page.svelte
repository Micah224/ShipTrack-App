<script lang="ts">
	import Anatomy from '$lib/components/site/Anatomy.svelte';
	import Assurance from '$lib/components/site/Assurance.svelte';
	import CheckTracker from '$lib/components/site/CheckTracker.svelte';
	import Close from '$lib/components/site/Close.svelte';
	import Faq from '$lib/components/site/Faq.svelte';
	import Hero from '$lib/components/site/Hero.svelte';
	import Modules from '$lib/components/site/Modules.svelte';
	import Pricing from '$lib/components/site/Pricing.svelte';
	import RouteLine from '$lib/components/site/RouteLine.svelte';
	import SiteFooter from '$lib/components/site/SiteFooter.svelte';
	import SiteNav from '$lib/components/site/SiteNav.svelte';

	let { data } = $props();

	/*
	 * Facts, not claims: minimums from the release metadata the update server
	 * hands WordPress, and the seat rule from the classifier.
	 */
	const specs = [
		{ label: 'WordPress', value: '6.5 or later' },
		{ label: 'PHP', value: '8.1 or later' },
		{ label: 'Updates', value: 'Through the WordPress updater' },
		{ label: 'Seats', value: 'Production sites only' }
	];
</script>

<svelte:head>
	<title>ShipTrack Pro · Shipment tracking for WordPress</title>
	<meta
		name="description"
		content="Road, rail, sea and air shipment tracking for WordPress, with a public tracking page your customers can follow, self-checking tracking numbers, and licensing that degrades instead of breaking."
	/>
</svelte:head>

<div class="st-site page">
	<a class="skip" href="#main">Skip to content</a>
	<SiteNav />

	<div class="sheet">
		<main id="main">
			<Hero />

			<ul class="specs" aria-label="Requirements and licensing">
				{#each specs as spec (spec.label)}
					<li>
						<span class="st-label">{spec.label}</span>
						<span class="specs__value">{spec.value}</span>
					</li>
				{/each}
			</ul>

			<RouteLine />
			<Anatomy />
			<CheckTracker />
			<Modules />
			<Assurance />
			<Pricing tiers={data.tiers} />
			<Faq supportEmail={data.supportEmail} />
			<Close />
		</main>
		<SiteFooter supportEmail={data.supportEmail} />
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		/* Beyond the sheet, the margins are hatched, as on a ruled manifest. */
		background-color: var(--bg);
		background-image: repeating-linear-gradient(135deg, var(--hatch) 0 1px, transparent 1px 7px);
	}
	.skip {
		position: absolute;
		left: 1rem;
		top: -3rem;
		z-index: 50;
		padding: 0.5rem 0.8rem;
		background: var(--ink);
		color: var(--bg);
	}
	.skip:focus {
		top: 0.75rem;
	}

	.sheet {
		max-width: 1216px;
		margin: 0 auto;
		border-inline: 1px solid var(--rule);
		background: var(--bg);
	}
	/* On a phone the sheet meets the screen edge, and the marks would widen the page. */
	@media (max-width: 1260px) {
		.sheet {
			overflow-x: clip;
		}
	}

	/*
	 * Every module after the hero starts on a ruled line, with a registration
	 * mark where the line meets each edge of the sheet.
	 */
	main > :global(section:not(:first-child)) {
		position: relative;
		border-top: 1px solid var(--rule);
	}
	main > :global(section:not(:first-child))::before,
	main > :global(section:not(:first-child))::after {
		content: '';
		position: absolute;
		top: -5px;
		z-index: 2;
		width: 9px;
		height: 9px;
		border: 1px solid var(--rule);
		background: var(--site-canvas);
	}
	main > :global(section:not(:first-child))::before {
		left: -5px;
	}
	main > :global(section:not(:first-child))::after {
		right: -5px;
	}

	.specs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--rule);
		background-image: repeating-linear-gradient(135deg, var(--hatch) 0 1px, transparent 1px 7px);
	}
	.specs li {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1.2rem 1.5rem;
		background: color-mix(in oklab, var(--bg) 70%, transparent);
	}
	.specs li + li {
		border-left: 1px dashed var(--rule);
	}
	.specs__value {
		font-weight: 600;
	}

	@media (max-width: 860px) {
		.specs {
			grid-template-columns: 1fr 1fr;
		}
		.specs li:nth-child(3) {
			border-left: 0;
		}
		.specs li:nth-child(n + 3) {
			border-top: 1px dashed var(--rule);
		}
		.specs li {
			padding: 1rem 1.25rem;
		}
	}
</style>
