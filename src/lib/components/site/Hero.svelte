<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from '$lib/ui/motion';
	import ContainerStack from './ContainerStack.svelte';
	import RouteChart from './RouteChart.svelte';
	import Waybill from './Waybill.svelte';

	/*
	 * Four planes, each moving at its own rate under the pointer and as the
	 * hero scrolls away: the route chart behind, the container yard, the
	 * waybill in front, and the ruled frame's crosshairs over everything. The
	 * headline sits between the chart and the yard. Depth comes from occlusion
	 * first (the tag overlaps the yard, the yard overlaps the chart), so the
	 * static composition still reads as layered with motion off.
	 */
	let animate = $state(false);

	/*
	 * Pointer and scroll parallax as an attachment: it runs once the section is
	 * in the DOM, writes three custom properties, and removes its listeners
	 * when the section goes. `animate` flips here rather than in a $derived
	 * because reduced motion is only knowable in the browser, and the server
	 * render must match the first client render.
	 */
	const parallax: Attachment<HTMLElement> = (el) => {
		if (prefersReducedMotion()) return;
		animate = true;

		let tx = 0;
		let ty = 0;
		let x = 0;
		let y = 0;
		let frame = 0;

		const paint = () => {
			frame = 0;
			x += (tx - x) * 0.09;
			y += (ty - y) * 0.09;
			const rect = el.getBoundingClientRect();
			const sy = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
			el.style.setProperty('--px', x.toFixed(4));
			el.style.setProperty('--py', y.toFixed(4));
			el.style.setProperty('--sy', sy.toFixed(4));
			if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) schedule();
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const onPointer = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse') return;
			const rect = el.getBoundingClientRect();
			tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
			ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
			schedule();
		};
		const onLeave = () => {
			tx = 0;
			ty = 0;
			schedule();
		};

		el.addEventListener('pointermove', onPointer);
		el.addEventListener('pointerleave', onLeave);
		window.addEventListener('scroll', schedule, { passive: true });
		schedule();

		return () => {
			cancelAnimationFrame(frame);
			el.removeEventListener('pointermove', onPointer);
			el.removeEventListener('pointerleave', onLeave);
			window.removeEventListener('scroll', schedule);
		};
	};
</script>

<section class="hero" {@attach parallax} aria-labelledby="hero-title">
	<div class="plane plane--chart" aria-hidden="true">
		<RouteChart {animate} />
	</div>

	<div class="hero__copy">
		<p class="st-label">[ Shipment tracking for WordPress ]</p>
		<h1 id="hero-title" class="st-display hero__title">Where's my shipment?</h1>
		<p class="hero__lede">
			The question your customers ask most, answered on your own site. ShipTrack Pro puts road,
			rail, sea and air shipments on one public tracking page, with notifications and an audit
			trail behind it.
		</p>
		<div class="hero__actions">
			<a href="#pricing" class="st-btn st-btn--tag st-btn--mint">See pricing</a>
			<a href={resolve('/portal')} class="st-btn st-btn--tag st-btn--ink">Open the licence portal</a>
		</div>
	</div>

	<div class="plane plane--stack" aria-hidden="true">
		<ContainerStack />
	</div>

	<div class="plane plane--tag" aria-hidden="true">
		<Waybill />
	</div>

	<span class="cross cross--tl" aria-hidden="true"></span>
	<span class="cross cross--tr" aria-hidden="true"></span>
	<span class="cross cross--bl" aria-hidden="true"></span>
	<span class="cross cross--br" aria-hidden="true"></span>
</section>

<style>
	.hero {
		--px: 0;
		--py: 0;
		--sy: 0;
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-height: clamp(620px, calc(100svh - 60px), 860px);
		overflow: clip;
		isolation: isolate;
	}

	.plane {
		position: absolute;
		will-change: transform;
		animation: arrive 900ms var(--st-ease-out) both;
	}
	.plane--chart {
		inset: 0;
		z-index: 0;
		transform: translate3d(calc(var(--px) * -8px), calc(var(--py) * -6px + var(--sy) * 60px), 0);
	}
	.plane--stack {
		right: 3%;
		top: 20%;
		z-index: 2;
		width: min(47%, 600px);
		animation-delay: 120ms;
		transform: translate3d(calc(var(--px) * 16px), calc(var(--py) * 10px + var(--sy) * -40px), 0);
	}
	.plane--tag {
		right: 29%;
		bottom: 9%;
		z-index: 3;
		width: min(330px, 30%);
		animation-delay: 260ms;
		transform: translate3d(calc(var(--px) * 28px), calc(var(--py) * 18px + var(--sy) * -120px), 0)
			rotate(calc(-4deg + var(--px) * 1.6deg));
	}

	@keyframes arrive {
		from {
			opacity: 0;
			translate: 0 18px;
		}
	}

	.hero__copy {
		position: relative;
		z-index: 1;
		align-self: center;
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
		max-width: 44rem;
		padding: 4rem 1.5rem 7rem;
	}
	/*
	 * Two lines, clear of the yard: narrower than the other display headings
	 * so "shipment?" fits the copy column whole. The question mark is the
	 * point of the headline and must never sit behind a container.
	 */
	.hero__title {
		max-width: 10.5ch;
		margin: 0;
		font-size: clamp(3rem, 6.1vw, 5.6rem);
		font-stretch: 108%;
		line-height: 0.98;
		color: var(--ink);
	}
	.hero__lede {
		max-width: 31rem;
		margin: 0;
		color: var(--ink-soft);
		font-size: 1.1rem;
		/* The chart is behind this; keep the paper clean under the words. */
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		box-shadow: 0 0 0 10px color-mix(in oklab, var(--bg) 82%, transparent);
	}
	.hero__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Crosshairs where the frame's rules meet, as on a registration sheet. */
	.cross {
		position: absolute;
		z-index: 4;
		width: 13px;
		height: 13px;
		pointer-events: none;
		background:
			linear-gradient(var(--ink), var(--ink)) center / 13px 1px no-repeat,
			linear-gradient(var(--ink), var(--ink)) center / 1px 13px no-repeat;
		opacity: 0.5;
	}
	.cross--tl {
		top: 14px;
		left: 14px;
	}
	.cross--tr {
		top: 14px;
		right: 14px;
	}
	.cross--bl {
		bottom: 14px;
		left: 14px;
	}
	.cross--br {
		bottom: 14px;
		right: 14px;
	}

	@media (max-width: 860px) {
		.hero {
			grid-template-rows: auto auto;
			min-height: 0;
		}
		.hero__copy {
			padding: 2.75rem 1.25rem 1rem;
		}
		.hero__title {
			font-size: clamp(2.8rem, 13vw, 4.6rem);
		}
		/*
		 * Phones get their own composition rather than a squeezed desktop: the
		 * yard moves below the copy at full width and the tag overlaps its foot.
		 */
		.plane--stack,
		.plane--tag {
			position: relative;
			right: auto;
			top: auto;
			bottom: auto;
		}
		.plane--stack {
			width: 92%;
			margin: 1.5rem auto 0;
			justify-self: center;
		}
		.plane--tag {
			width: min(300px, 80%);
			margin: -3.5rem 0 3rem 1.25rem;
		}
		/*
		 * The chart moves down behind the yard so no lane or port label crosses
		 * the headline, and fades in from the top instead of starting on a line.
		 */
		.plane--chart {
			inset: 34% 0 0 0;
			opacity: 0.7;
			mask-image: linear-gradient(to bottom, transparent, #000 18%);
		}
	}
</style>
