<script lang="ts">
	import { drawBox, type Box } from './iso';

	interface Props {
		box: Box;
		unit: number;
		/** The container's paint; the two walls are derived darker from it. */
		paint: string;
		/** The roof, when it should differ from the walls. */
		lid?: string;
		/** Outline colour. */
		line?: string;
		/** Rib and locking-bar colour. */
		detail?: string;
		ribs?: number;
		stroke?: number;
	}

	let {
		box,
		unit,
		paint,
		lid,
		line = 'currentColor',
		detail = 'currentColor',
		ribs = 9,
		stroke = 1
	}: Props = $props();

	const d = $derived(drawBox(box, unit, ribs));
</script>

<g stroke={line} stroke-width={stroke} stroke-linejoin="round">
	<polygon points={d.side} style:fill="color-mix(in oklab, {paint} 84%, #000)" />
	<polygon points={d.end} style:fill="color-mix(in oklab, {paint} 68%, #000)" />
	<polygon points={d.top} style:fill={lid ?? paint} />
	<g stroke={detail} stroke-width={stroke * 0.8} stroke-linecap="round" opacity="0.55">
		{#each d.ribs as [x1, y1, x2, y2], i (i)}
			<line {x1} {y1} {x2} {y2} />
		{/each}
		{#each d.bars as [x1, y1, x2, y2], i (i)}
			<line {x1} {y1} {x2} {y2} />
		{/each}
	</g>
</g>
