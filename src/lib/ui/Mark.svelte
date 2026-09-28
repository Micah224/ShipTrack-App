<script lang="ts">
	import Container from './Container.svelte';
	import { bounds } from './iso';

	interface Props {
		size?: number;
		/** `light` sits on the light sheet, `dark` on the console. */
		tone?: 'light' | 'dark';
	}

	let { size = 28, tone = 'light' }: Props = $props();

	// One container, three-quarters on: long side left, door end right, with
	// the roof in mint as the single place the mark carries the accent.
	const box = { x: 0, y: 0, z: 0, lx: 1.9, ly: 1, lz: 1 };
	const unit = 12;
	const viewBox = bounds([box], unit, 1.5);
	const paint = $derived(tone === 'light' ? '#0b3b5c' : '#4a5057');
</script>

<svg width={size} height={size} {viewBox} aria-hidden="true" class="mark">
	<Container
		{box}
		{unit}
		{paint}
		lid="#28e99f"
		line="transparent"
		detail="#e8f6ff"
		ribs={5}
		stroke={1.1}
	/>
</svg>

<style>
	.mark {
		display: block;
		flex: none;
	}
</style>
