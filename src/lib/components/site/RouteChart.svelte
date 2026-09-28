<script lang="ts">
	interface Props {
		/** Animate the marker along the live route. Off for reduced motion and SSR. */
		animate?: boolean;
	}

	let { animate = false }: Props = $props();

	/*
	 * Illustrative ports and lanes, kept to the right half of the plane so the
	 * headline always sits on clean paper. Coordinates are in a 1200 x 720 box.
	 */
	const ports = [
		{ code: 'LDN', x: 612, y: 136, anchor: 'end' },
		{ code: 'HAM', x: 800, y: 86, anchor: 'start' },
		{ code: 'NYC', x: 1096, y: 92, anchor: 'end' },
		{ code: 'DLA', x: 1062, y: 612, anchor: 'start' },
		{ code: 'LOS', x: 890, y: 650, anchor: 'end' }
	] as const;

	// The live lane leaves LDN over the top of the yard and comes down its
	// right side to DLA, so the marker travelling it stays in view.
	const live = 'M612,136 C900,20 1210,300 1062,612';
	const lanes = ['M800,86 Q960,40 1096,92', 'M890,650 Q980,690 1062,612'];
</script>

<svg viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" class="chart" aria-hidden="true">
	<defs>
		<pattern id="paper-minor" width="40" height="40" patternUnits="userSpaceOnUse">
			<path d="M40 0H0V40" fill="none" stroke="var(--site-ink)" stroke-width="0.5" opacity="0.07" />
		</pattern>
		<pattern id="paper-major" width="160" height="160" patternUnits="userSpaceOnUse">
			<rect width="160" height="160" fill="url(#paper-minor)" />
			<path d="M160 0H0V160" fill="none" stroke="var(--site-ink)" stroke-width="0.75" opacity="0.13" />
		</pattern>
	</defs>

	<rect width="1200" height="720" fill="url(#paper-major)" />

	<g fill="none" stroke="var(--site-ink)" stroke-linecap="round">
		{#each lanes as d (d)}
			<path {d} stroke-width="1.2" stroke-dasharray="2 7" opacity="0.45" />
		{/each}
		<path d={live} stroke-width="2" opacity="0.9" />
	</g>

	{#each ports as port (port.code)}
		<g transform="translate({port.x} {port.y})">
			<rect x="-5" y="-5" width="10" height="10" fill="var(--site-canvas)" stroke="var(--site-ink)" stroke-width="1.25" />
			<text
				x={port.anchor === 'end' ? -12 : 12}
				y="4"
				text-anchor={port.anchor}
				class="chart__code">{port.code}</text
			>
		</g>
	{/each}

	<circle r="6" fill="var(--amber)" stroke="var(--site-ink)" stroke-width="1.25" cx="0" cy="0">
		{#if animate}
			<animateMotion dur="9s" repeatCount="indefinite" path={live} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
		{:else}
			<!-- Parked two-thirds of the way down the lane when not animating. -->
			<animateMotion dur="0.001s" fill="freeze" path={live} keyPoints="0.66;0.66" keyTimes="0;1" calcMode="linear" />
		{/if}
	</circle>
</svg>

<style>
	.chart {
		display: block;
		width: 100%;
		height: 100%;
	}
	.chart__code {
		font-family: var(--st-font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		fill: var(--site-ink-soft);
	}
</style>
