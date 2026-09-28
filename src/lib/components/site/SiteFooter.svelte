<script lang="ts">
	import { resolve } from '$app/paths';
	import Container from '$lib/ui/Container.svelte';
	import { bounds, type Box } from '$lib/ui/iso';
	import Mark from '$lib/ui/Mark.svelte';

	interface Props {
		/** SUPPORT_EMAIL, when configured; the Support link is left out otherwise. */
		supportEmail: string | null;
	}

	let { supportEmail }: Props = $props();

	/*
	 * The status light asks the real licence API, not a status page: the same
	 * unauthenticated liveness probe the runbook uses. It only reports what it
	 * saw from this browser, and says so.
	 */
	let api = $state<'checking' | 'up' | 'down'>('checking');

	$effect(() => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 5000);
		fetch(resolve('/api/v1/heartbeat'), { signal: controller.signal })
			.then(async (res) => {
				const body = res.ok ? await res.json() : null;
				api = body?.ok && body?.ready ? 'up' : 'down';
			})
			.catch(() => {
				api = 'down';
			})
			.finally(() => clearTimeout(timer));
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	/*
	 * A yard of containers along the bottom edge, in the sheet's own greys.
	 * Slots step along (1, -1) in yard units, which projects to a horizontal
	 * screen line, so each row runs straight across the footer; rows step
	 * along (1, 1), straight towards the viewer. The yard is wider than any
	 * footer and `slice` crops its ends. Gaps come from a fixed pattern, not
	 * Math.random, so the server and the browser draw the same yard.
	 */
	const SLOTS = 22;
	const GAPS = new Set([3, 9, 14, 19, 26, 31, 37, 50, 55, 61]);
	const field: Box[] = [];
	for (let row = 0; row < 3; row++) {
		// Odd rows sit half a slot along, so the rows interleave like a real stack.
		const shift = row % 2 ? 0.9 : 0;
		for (let slot = 0; slot < SLOTS; slot++) {
			if (GAPS.has(row * SLOTS + slot)) continue;
			const x = slot * 1.8 + shift + row * 1.25;
			const y = -slot * 1.8 - shift + row * 1.25;
			field.push({ x, y, z: 0, lx: 2.4, ly: 1, lz: 1 });
			// A second tier on the back row only, so no nearer box sits on top.
			if (row === 0 && slot % 5 === 2) field.push({ x, y, z: 1, lx: 2.4, ly: 1, lz: 1 });
		}
	}
	// Back to front: a row shares one x + y, so that orders rows; tiers go up.
	field.sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z || a.x - b.x);
	const unit = 22;
	const viewBox = bounds(field, unit, 4);

</script>

<footer class="foot">
	<div class="foot__grid">
		<div class="foot__brand">
			<Mark size={40} />
			<p class="foot__word">ShipTrack Pro</p>
			<p class="foot__tag">Shipment tracking for WordPress.</p>
		</div>

		<nav class="foot__col" aria-label="Product">
			<p class="st-label">Product</p>
			<ul>
				<li><a href="#route">How it works</a></li>
				<li><a href="#check">Tracking check</a></li>
				<li><a href="#modules">Modules</a></li>
				<li><a href="#pricing">Pricing</a></li>
			</ul>
		</nav>

		<nav class="foot__col" aria-label="Customers">
			<p class="st-label">Customers</p>
			<ul>
				<li><a href={resolve('/portal')}>Licence portal</a></li>
				<li><a href="#faq">FAQ</a></li>
				{#if supportEmail}
					<li><a href="mailto:{supportEmail}">Support</a></li>
				{/if}
			</ul>
		</nav>

		<div class="foot__col">
			<p class="st-label">Status</p>
			<p class="foot__status" data-state={api}>
				<i aria-hidden="true"></i>
				{#if api === 'checking'}
					Checking the licence API…
				{:else if api === 'up'}
					Licence API is answering
				{:else}
					Licence API did not answer from here
				{/if}
			</p>
		</div>
	</div>

	<svg class="foot__yard" {viewBox} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
		{#each field as box, i (i)}
			<Container {box} {unit} paint="#dcdcd8" line="#c4c4bf" detail="#b5b5af" ribs={7} stroke={1} />
		{/each}
	</svg>

	<p class="foot__legal">© {new Date().getFullYear()} ShipTrack Pro</p>
</footer>

<style>
	.foot {
		border-top: 1px solid var(--rule);
		overflow: hidden;
	}
	.foot__grid {
		display: grid;
		grid-template-columns: 1.4fr repeat(3, minmax(0, 1fr));
		border-bottom: 1px dashed var(--rule);
	}
	.foot__grid > * {
		padding: 2.5rem 1.5rem;
	}
	.foot__grid > * + * {
		border-left: 1px dashed var(--rule);
	}
	.foot__word {
		margin: 1rem 0 0.25rem;
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-size: 1.3rem;
		font-weight: 700;
	}
	.foot__tag {
		margin: 0;
		color: var(--ink-soft);
	}
	.foot__col ul {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}
	.foot__col a {
		color: var(--ink);
		font-family: var(--st-font-mono);
		font-size: 13px;
		letter-spacing: 0.04em;
		text-decoration: none;
		text-transform: uppercase;
	}
	.foot__col a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.foot__status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0 0;
		font-family: var(--st-font-mono);
		font-size: 13px;
	}
	.foot__status i {
		width: 9px;
		height: 9px;
		flex: none;
		border: 1.25px solid var(--ink);
		border-radius: 50%;
		background: var(--sheet);
	}
	.foot__status[data-state='up'] i {
		background: var(--mint);
	}
	.foot__status[data-state='down'] i {
		background: var(--amber);
	}
	.foot__yard {
		display: block;
		width: 100%;
		height: clamp(120px, 16vw, 220px);
		margin-top: 2.5rem;
	}
	.foot__legal {
		margin: 0;
		padding: 1rem 1.5rem 1.4rem;
		color: var(--ink-faint);
		font-family: var(--st-font-mono);
		font-size: 12px;
		text-align: right;
	}

	@media (max-width: 860px) {
		.foot__grid {
			grid-template-columns: 1fr 1fr;
		}
		.foot__brand {
			grid-column: 1 / -1;
		}
		.foot__grid > * + * {
			border-left: 0;
		}
		.foot__grid > *:nth-child(n + 2) {
			border-top: 1px dashed var(--rule);
			padding: 1.75rem 1.25rem;
		}
		.foot__grid > *:nth-child(3) {
			border-left: 1px dashed var(--rule);
		}
		.foot__grid > *:last-child {
			grid-column: 1 / -1;
		}
	}
</style>
