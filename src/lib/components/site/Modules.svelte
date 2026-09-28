<script lang="ts">
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import { reveal } from '$lib/ui/motion';

	/*
	 * What is in the box. Every sentence here maps to a capability flag in
	 * domain/tiers.ts or to behaviour in the plugin; the tier qualifiers are
	 * deliberately vague ("on the tiers that include them") because the pricing
	 * table below states them exactly, from the same matrix the licence server
	 * grants from.
	 */
	const modules: { code: string; icon: IconName; title: string; body: string }[] = [
		{
			code: 'M01',
			icon: 'route',
			title: 'Road, rail, sea and air',
			body: 'Each mode with its own routing on the map, all on the one tracking page your customers bookmark.'
		},
		{
			code: 'M02',
			icon: 'map',
			title: 'OpenStreetMap or Google Maps',
			body: 'OpenStreetMap on every licence. Google Maps on the tiers that include it, falling back to OpenStreetMap on its own if that ever lapses.'
		},
		{
			code: 'M03',
			icon: 'lifecycle',
			title: 'A lifecycle that cannot be skipped',
			body: 'Shipments move from pending to delivered through fixed steps, so the history a customer reads is one that actually happened.'
		},
		{
			code: 'M04',
			icon: 'bell',
			title: 'Customers hear first',
			body: 'Standard notifications on every licence, with templates and custom channels on the tiers that include them.'
		},
		{
			code: 'M05',
			icon: 'audit',
			title: 'Every change on the record',
			body: 'An audit trail on every licence, with longer retention and export on the tiers that include them.'
		},
		{
			code: 'M06',
			icon: 'brush',
			title: 'Your name on the page',
			body: 'White-label the tracking page, or run it on your own domain, so it reads as part of your site.'
		}
	];
</script>

<section id="modules" class="modules" aria-labelledby="modules-title">
	<div class="modules__head">
		<p class="st-label">[ L04 ] In the box</p>
		<h2 id="modules-title" class="st-display modules__title">Everything behind the tracking page.</h2>
	</div>

	<!--
		The grid is observed, not the cards: a card clipped to nothing is never
		"intersecting", so observing it directly left every card hidden.
	-->
	<ul class="modules__grid" {@attach reveal(0.12)}>
		{#each modules as module, i (module.code)}
			<li class="module" style:--i={i}>
				<div class="module__top">
					<span class="module__icon"><Icon name={module.icon} size={24} /></span>
					<span class="st-label">{module.code}</span>
				</div>
				<h3 class="module__title">{module.title}</h3>
				<p class="module__body">{module.body}</p>
			</li>
		{/each}
	</ul>
</section>

<style>
	.modules {
		padding: 6.5rem 1.5rem 7rem;
	}
	.modules__head {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 3rem;
	}
	.modules__title {
		max-width: 16ch;
		margin: 0;
		font-size: clamp(2.2rem, 4.6vw, 3.9rem);
		font-stretch: 112%;
	}
	.modules__grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--rule);
		border-left: 1px solid var(--rule);
	}
	.module {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-height: 15rem;
		padding: 1.6rem 1.5rem 1.8rem;
		border-right: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		background: var(--bg);
		transition:
			clip-path 700ms var(--ease-out),
			background-color 200ms var(--ease-out);
		transition-delay: calc(var(--i) * 80ms), 0ms;
	}
	.module:hover {
		background: var(--sheet);
	}
	/* The wipe: while the grid is pending its cards are clipped shut, then open left to right in turn. */
	.modules__grid:global([data-reveal='pending']) .module {
		clip-path: inset(0 100% 0 0);
	}
	.modules__grid:global([data-reveal='in']) .module {
		clip-path: inset(0 0 0 0);
	}
	.module__top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.4rem;
	}
	.module__icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--ink);
		background: var(--sheet);
		color: var(--ink);
	}
	.module__title {
		margin: 0;
		font-family: var(--font-display);
		font-stretch: 110%;
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.15;
	}
	.module__body {
		margin: 0;
		color: var(--ink-soft);
	}

	@media (max-width: 960px) {
		.modules__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.modules {
			padding: 4.5rem 1.25rem 5rem;
		}
		.modules__grid {
			grid-template-columns: 1fr;
		}
		.module {
			min-height: 0;
		}
	}
</style>
