<script lang="ts" module>
	/*
	 * Line icons, drawn on a 24px grid with a 1.6px stroke so they sit with the
	 * mono labels rather than competing with them. Paths only; colour comes
	 * from currentColor.
	 */
	const PATHS = {
		overview: 'M3 20h18M5 16l4.5-5 3.5 3 6-7M18 7h1.5v1.5',
		licences:
			'M14.5 9.5a4 4 0 1 0-3.9 4.4L7 17.5V20h2.5v-1.5H11V17l2.6-2.6A4 4 0 0 0 14.5 9.5ZM16 8h.01',
		seats: 'M4 5h16v10H4zM9 19h6M12 15v4M7.5 9.5h4',
		releases: 'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5',
		audit: 'M8 4h8l1 2h2v15H5V6h2l1-2Zm0 7h8M8 15h5',
		search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.6-1.9L20 20',
		logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
		check: 'M5 12.5 9.5 17 19 7',
		cross: 'M6 6l12 12M18 6 6 18',
		warn: 'M12 4 21 20H3L12 4Zm0 6v4.5m0 2.5h.01',
		dot: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
		chevron: 'M6 9l6 6 6-6',
		arrow: 'M5 12h14M13 6l6 6-6 6',
		truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 7 19Zm10 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
		train:
			'M7 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 7h14M8.5 14h.01M15.5 14h.01M8 17l-2 3m10-3 2 3',
		ship: 'M4 15h16l-2 4H6l-2-4Zm3-1V9h10v5M9.5 9V5h5v4M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1',
		plane: 'M21 15.5 13.5 12V6a1.5 1.5 0 0 0-3 0v6L3 15.5V17l7.5-2.2V19L8 20.5V22l4-1 4 1v-1.5L13.5 19v-4.2L21 17v-1.5Z',
		map: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13.5m6-11v13.5',
		bell: 'M6 10a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10Zm4 9.5a2 2 0 0 0 4 0',
		shield: 'M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Zm-3 9 2 2 4-4',
		brush: 'M14.5 4.5 19.5 9.5 11 18l-5 1.5L7.5 14.5 14.5 4.5ZM7.5 14.5l2 2',
		route: 'M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.5 14.5C9 9 15 15 17.5 9.5',
		lifecycle: 'M4 12h3l2-5 3 10 2-5h6',
		external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		/** Announce the icon; otherwise it is decorative and hidden from AT. */
		label?: string;
		stroke?: number;
	}

	let { name, size = 18, label, stroke = 1.6 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	class="icon"
>
	<path d={PATHS[name]} />
</svg>

<style>
	.icon {
		display: block;
		flex: none;
	}
</style>
