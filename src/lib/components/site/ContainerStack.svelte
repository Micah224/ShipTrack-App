<script lang="ts">
	import Container from '$lib/ui/Container.svelte';
	import { bounds, project, type Box } from '$lib/ui/iso';

	/*
	 * A small container yard, drawn back to front so nearer boxes overlap
	 * farther ones: back row, its second tier, front row, its second tier, then
	 * the one on top. The mint-roofed box on top is the shipment the waybill in
	 * front of it belongs to.
	 */
	const L = { lx: 2.4, ly: 1, lz: 1 };
	const yard: { box: Box; paint: string; detail?: string }[] = [
		{ box: { x: 0, y: 0, z: 0, ...L }, paint: '#f7f7f5' },
		{ box: { x: 2.5, y: 0, z: 0, ...L }, paint: '#0b3b5c', detail: '#d6e8ff' },
		{ box: { x: 1.25, y: 0, z: 1, ...L }, paint: '#d6e8ff' },
		{ box: { x: 0.6, y: 1.15, z: 0, ...L }, paint: '#f59e0b' },
		{ box: { x: 3.1, y: 1.15, z: 0, ...L }, paint: '#c9ccd3' },
		{ box: { x: 1.85, y: 1.15, z: 1, ...L }, paint: '#f7f7f5' },
		{ box: { x: 1.55, y: 0.55, z: 2, ...L }, paint: '#f7f7f5' }
	];

	const unit = 44;
	const dock: Box = { x: -0.45, y: -0.35, z: 0, lx: 6.4, ly: 3, lz: 0 };
	const viewBox = bounds([...yard.map((c) => c.box), dock], unit, 6);

	const slab = [
		[dock.x, dock.y],
		[dock.x + dock.lx, dock.y],
		[dock.x + dock.lx, dock.y + dock.ly],
		[dock.x, dock.y + dock.ly]
	]
		.map(([x, y]) => project(x, y, 0, unit).join(','))
		.join(' ');
</script>

<svg {viewBox} class="stack" aria-hidden="true">
	<defs>
		<pattern id="dock-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
			<line x1="0" y1="0" x2="0" y2="7" stroke="var(--site-ink)" stroke-width="1" opacity="0.16" />
		</pattern>
	</defs>

	<polygon points={slab} fill="url(#dock-hatch)" stroke="var(--site-rule)" stroke-dasharray="4 4" />

	{#each yard as { box, paint, detail }, i (i)}
		<Container
			{box}
			{unit}
			{paint}
			lid={i === yard.length - 1 ? '#28e99f' : undefined}
			line="#0e2a3f"
			detail={detail ?? '#0e2a3f'}
			stroke={1.25}
		/>
	{/each}
</svg>

<style>
	.stack {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
</style>
