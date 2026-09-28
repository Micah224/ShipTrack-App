<script lang="ts">
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';

	/*
	 * What a licence never does to a customer's site. Each point is how the
	 * plugin actually behaves: the seat classifier (domain/site.ts), the
	 * degrade-not-break gating in the plugin's RoutingService and map provider
	 * filter, Entitlement's grace period, and UpdateManager.
	 */
	const points: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'seats',
			title: 'Staging is free',
			body: 'Seats count production sites only. Staging copies, managed-host previews and local installs never take one.'
		},
		{
			icon: 'map',
			title: 'Lapses are gentle',
			body: "If a licence lapses, Google Maps falls back to OpenStreetMap and rail and sea to an indicative route. Your customers' tracking page keeps working; only creating and editing shipments waits for renewal."
		},
		{
			icon: 'shield',
			title: 'Offline is not expired',
			body: 'A grace period keeps a site running when the licence server cannot be reached. Revocation and suspension are the only things that skip it.'
		},
		{
			icon: 'releases',
			title: 'Updates the WordPress way',
			body: "New versions arrive through WordPress's own plugin updater, checked against a signed licence."
		}
	];
</script>

<section class="assure" aria-labelledby="assure-title">
	<div class="assure__head">
		<p class="st-label">[ L05 ] Licensing</p>
		<h2 id="assure-title" class="st-display assure__title">A licence that degrades. Never one that breaks.</h2>
	</div>

	<ol class="assure__grid">
		{#each points as point, i (point.title)}
			<li class="point">
				<div class="point__top">
					<span class="point__icon"><Icon name={point.icon} size={22} /></span>
					<span class="st-label">[ 0{i + 1} ]</span>
				</div>
				<h3 class="point__title">{point.title}</h3>
				<p class="point__body">{point.body}</p>
			</li>
		{/each}
	</ol>
</section>

<style>
	.assure {
		--ink: #eaf2f7;
		--ink-soft: #a9c1d1;
		--rule: rgb(234 242 247 / 0.18);
		--focus: var(--mint);
		padding: 6.5rem 1.5rem 7rem;
		background:
			linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px) 0 0 / 40px 40px,
			linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px) 0 0 / 40px 40px,
			var(--navy);
		color: var(--ink);
	}
	.assure__head {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 3.5rem;
	}
	.assure__title {
		max-width: 17ch;
		margin: 0;
		font-size: clamp(2.2rem, 4.6vw, 3.9rem);
		font-stretch: 112%;
	}
	.assure__grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--rule);
	}
	.point {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.6rem 1.5rem 0 0;
	}
	.point + .point {
		padding-left: 1.5rem;
		border-left: 1px dashed var(--rule);
	}
	.point__top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.point__icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		background: var(--mint);
		color: var(--mint-ink);
	}
	.point__title {
		margin: 0;
		font-family: var(--st-font-display);
		font-stretch: 110%;
		font-size: 1.3rem;
		font-weight: 700;
		line-height: 1.15;
	}
	.point__body {
		margin: 0;
		color: var(--ink-soft);
	}

	@media (max-width: 960px) {
		.assure__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			row-gap: 2rem;
		}
		.point:nth-child(3) {
			padding-left: 0;
			border-left: 0;
		}
	}
	@media (max-width: 600px) {
		.assure {
			padding: 4.5rem 1.25rem 5rem;
		}
		.assure__grid {
			grid-template-columns: 1fr;
		}
		.point + .point {
			padding-left: 0;
			border-left: 0;
			border-top: 1px dashed var(--rule);
		}
	}
</style>
