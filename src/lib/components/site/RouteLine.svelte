<script lang="ts">
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import { scrollProgress } from '$lib/ui/motion';

	/*
	 * One shipment, four legs, one page. Scroll progress (`--p`) is split into
	 * four local ranges, one per leg: each leg's track is clipped to its own
	 * share, its stop lights when the line reaches it, and its words fade in as
	 * the line arrives. Only the track is clipped, so no word is ever cut in
	 * half mid-reveal. Clipping rather than stroke-dashoffset because three of
	 * the four tracks are dashed patterns, which a dash-offset reveal scrambles.
	 */
	const legs: { mode: string; icon: IconName; from: string; note: string }[] = [
		{ mode: 'Road', icon: 'truck', from: 'Depot', note: 'Collected and scanned' },
		{ mode: 'Rail', icon: 'train', from: 'Rail hub', note: 'Loaded for the port' },
		{ mode: 'Sea', icon: 'ship', from: 'Port', note: 'Crossing, position updated' },
		{ mode: 'Air', icon: 'plane', from: 'Airport', note: 'Last long hop' }
	];
</script>

<section id="route" class="route" {@attach scrollProgress(0.8, 0.6)} aria-labelledby="route-title">
	<div class="route__head">
		<p class="st-label">[ L01 ] One route</p>
		<h2 id="route-title" class="st-display route__title">One tracking page. Four ways to move.</h2>
		<p class="route__lede">
			Your customer does not care whether their shipment is on a truck, a train, a ship or a plane.
			They want one page that says where it is. ShipTrack Pro draws every mode on the same page,
			in OpenStreetMap or Google Maps.
		</p>
	</div>

	<ol class="route__line">
		{#each legs as leg, i (leg.mode)}
			<li class="leg" style:--i={i} data-mode={leg.mode.toLowerCase()}>
				<span class="leg__stop"></span>
				<span class="leg__track"></span>
				<span class="leg__icon"><Icon name={leg.icon} size={22} /></span>
				<span class="leg__mode">{leg.mode}</span>
				<span class="st-label leg__from">{leg.from}</span>
				<span class="leg__note">{leg.note}</span>
			</li>
		{/each}
		<li class="leg leg--end" style:--i={legs.length - 0.25}>
			<span class="leg__stop"></span>
			<span class="leg__mode">Door</span>
			<span class="st-label leg__from">Delivered</span>
		</li>
	</ol>
</section>

<style>
	/*
	 * Finished by default. The scrollProgress attachment writes the real value
	 * the moment it mounts, so without JavaScript, or before hydration, every
	 * leg is drawn and readable rather than hidden by CSS alone.
	 */
	.route {
		--p: 1;
		padding: 6rem 1.5rem 6.5rem;
	}
	.route__head {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 1rem 3rem;
		align-items: end;
		margin-bottom: 4.5rem;
	}
	.route__head .st-label {
		grid-column: 1 / -1;
	}
	.route__title {
		margin: 0;
		font-size: clamp(2.2rem, 4.6vw, 3.9rem);
		font-stretch: 112%;
	}
	.route__lede {
		margin: 0;
		color: var(--ink-soft);
		font-size: 1.05rem;
	}

	.route__line {
		position: relative;
		display: grid;
		grid-template-columns: repeat(4, 1fr) auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* This leg's share of the journey: 0 until the line reaches it, 1 once it has crossed it. */
	.leg {
		--local: clamp(0, var(--p) * 4 - var(--i), 1);
		--seen: clamp(0, (var(--p) * 4 - var(--i)) * 4, 1);
	}
	.leg__icon,
	.leg__mode,
	.leg__from,
	.leg__note {
		opacity: var(--seen);
		translate: 0 calc((1 - var(--seen)) * 8px);
	}

	.leg {
		position: relative;
		display: grid;
		grid-template-rows: 44px 28px auto auto auto;
		gap: 0.35rem;
		padding-right: 1.25rem;
	}
	.leg__stop {
		position: absolute;
		top: 38px;
		left: -7px;
		z-index: 1;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--ink);
		background: var(--bg);
	}
	/*
	 * A stop lights once the line has reached it: a mint fill whose opacity is
	 * a step function of scroll progress, 0 before the stop and 1 after.
	 */
	.leg__stop::after {
		content: '';
		position: absolute;
		inset: 2px;
		background: var(--mint);
		opacity: clamp(0, (var(--p) * 4 - var(--i) + 0.01) * 1000, 1);
		transition: opacity 240ms var(--st-ease-out);
	}
	.leg__track {
		position: absolute;
		top: 44px;
		left: 0;
		right: 0;
		height: 2px;
		margin-top: -1px;
		background: var(--ink);
		clip-path: inset(-6px calc((1 - var(--local)) * 100%) -6px 0);
	}
	.leg[data-mode='rail'] .leg__track {
		height: 8px;
		margin-top: -4px;
		background:
			linear-gradient(var(--ink), var(--ink)) top / 100% 1.5px no-repeat,
			linear-gradient(var(--ink), var(--ink)) bottom / 100% 1.5px no-repeat,
			repeating-linear-gradient(90deg, var(--ink) 0 1.5px, transparent 1.5px 9px);
	}
	.leg[data-mode='sea'] .leg__track {
		height: 8px;
		margin-top: -4px;
		background: radial-gradient(circle at 50% 0, transparent 5px, var(--ink) 5px 6.5px, transparent 6.5px) 0 0 / 14px 8px repeat-x;
	}
	.leg[data-mode='air'] .leg__track {
		height: 2px;
		background: repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 8px);
	}
	.leg__icon {
		grid-row: 1;
		align-self: start;
		display: grid;
		place-items: center;
		width: 34px;
		height: 30px;
		color: var(--ink);
	}
	.leg__mode {
		grid-row: 3;
		margin-top: 1.1rem;
		font-family: var(--st-font-display);
		font-stretch: 115%;
		font-size: 1.35rem;
		font-weight: 700;
	}
	.leg__from {
		grid-row: 4;
	}
	.leg__note {
		grid-row: 5;
		color: var(--ink-soft);
		font-size: 0.95rem;
	}
	.leg--end {
		padding-right: 0;
		grid-template-rows: 44px 28px auto auto;
	}

	@media (max-width: 860px) {
		.route {
			padding: 4.5rem 1.25rem 5rem;
		}
		.route__head {
			grid-template-columns: 1fr;
			margin-bottom: 2.5rem;
		}
		/*
		 * Phones run the route down the page instead of across it: a line of
		 * four 90px legs is unreadable, a line of four full-width stops is not.
		 */
		.route__line {
			grid-template-columns: 1fr;
			padding-left: 2.25rem;
		}
		.leg,
		.leg--end {
			grid-template-rows: auto;
			grid-template-columns: 34px 1fr;
			column-gap: 0.75rem;
			padding: 0 0 2.2rem;
		}
		.leg__stop {
			top: 4px;
			left: calc(-2.25rem - 7px + 1px);
		}
		.leg__track,
		.leg[data-mode] .leg__track {
			top: 18px;
			bottom: 0;
			left: calc(-2.25rem);
			right: auto;
			width: 2px;
			height: auto;
			margin: 0;
			background: var(--ink);
			clip-path: inset(0 -6px calc((1 - var(--local)) * 100%) -6px);
		}
		.leg[data-mode='rail'] .leg__track,
		.leg[data-mode='air'] .leg__track {
			background: repeating-linear-gradient(180deg, var(--ink) 0 3px, transparent 3px 8px);
		}
		.leg__icon {
			grid-row: 1 / span 3;
			grid-column: 1;
		}
		.leg__mode,
		.leg__from,
		.leg__note {
			grid-column: 2;
			grid-row: auto;
			margin: 0;
		}
	}
</style>
