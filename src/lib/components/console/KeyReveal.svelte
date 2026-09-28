<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';

	interface Props {
		/** The plaintext licence key. */
		value: string;
		title: string;
		/** Why this key is on screen, and what happens to it next. */
		note: string;
		tone: 'good' | 'warn';
	}

	let { value, title, note, tone }: Props = $props();
	const uid = $props.id();

	let copied = $state<'idle' | 'done' | 'failed'>('idle');

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = 'done';
		} catch {
			// No clipboard permission, or not a secure context: the key is
			// select-all, so selecting it by hand still works.
			copied = 'failed';
		}
	}
</script>

<section class="key" data-tone={tone} aria-labelledby="{uid}-title">
	<div class="key__head">
		<Icon name={tone === 'good' ? 'check' : 'warn'} size={18} />
		<h2 id="{uid}-title" class="key__title">{title}</h2>
	</div>
	<p class="key__note">{note}</p>
	<div class="key__row">
		<code class="key__value">{value}</code>
		<button class="st-btn st-btn--ghost st-btn--sm" type="button" onclick={copy}>
			{copied === 'done' ? 'Copied' : 'Copy'}
		</button>
	</div>
	<p class="key__status" role="status">
		{#if copied === 'done'}Copied to the clipboard.{:else if copied === 'failed'}The browser refused the clipboard. Select the key and copy it by hand.{/if}
	</p>
</section>

<style>
	.key {
		--tone: var(--con-good);
		margin-bottom: 1.25rem;
		padding: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--tone) 55%, transparent);
		border-left-width: 4px;
		background: color-mix(in oklab, var(--tone) 6%, var(--sheet));
	}
	.key[data-tone='warn'] {
		--tone: var(--con-warn);
	}
	.key__head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--tone);
	}
	.key__title {
		margin: 0;
		color: var(--ink);
		font-size: 1.05rem;
		font-weight: 600;
	}
	.key__note {
		max-width: 48rem;
		margin: 0.5rem 0 1rem;
		color: var(--ink-soft);
		font-size: 14px;
	}
	.key__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}
	.key__value {
		flex: 1 1 22rem;
		padding: 0.8rem 1rem;
		border: 1px dashed var(--rule);
		background: var(--bg);
		font-family: var(--st-font-mono);
		font-size: 1.05rem;
		letter-spacing: 0.06em;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.key__status {
		min-height: 1.2em;
		margin: 0.5rem 0 0;
		color: var(--ink-faint);
		font-size: 13px;
	}
</style>
