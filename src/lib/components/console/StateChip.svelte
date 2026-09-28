<script lang="ts" module>
	export type Tone = 'good' | 'warn' | 'crit' | 'neutral';
</script>

<script lang="ts">
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';

	interface Props {
		tone: Tone;
		label: string;
		/** Keep the label's own case, for identifiers such as audit actions. */
		raw?: boolean;
	}

	let { tone, label, raw = false }: Props = $props();

	/*
	 * A different glyph per tone, so state survives greyscale, every colour
	 * vision deficiency and forced colours: the colour is never the only cue.
	 */
	const GLYPH: Record<Tone, IconName | null> = {
		good: 'dot',
		warn: 'warn',
		crit: 'cross',
		neutral: null
	};
	const glyph = $derived(GLYPH[tone]);
</script>

<span class="st-chip" data-tone={tone === 'neutral' ? undefined : tone} data-raw={raw || undefined}>
	{#if glyph}<Icon name={glyph} size={12} stroke={2} />{/if}{label}
</span>
