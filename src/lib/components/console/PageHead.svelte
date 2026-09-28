<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Bracketed sheet code, as on the landing page's legs: C01, C02… */
		code: string;
		title: string;
		lede?: string;
		/** Search, primary action: whatever the screen offers at its head. */
		children?: Snippet;
	}

	let { code, title, lede, children }: Props = $props();
</script>

<header class="head">
	<div class="head__text">
		<p class="st-label">[ {code} ] Console</p>
		<h1 class="head__title">{title}</h1>
		{#if lede}<p class="head__lede">{lede}</p>{/if}
	</div>
	{#if children}
		<div class="head__actions">{@render children()}</div>
	{/if}
</header>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.25rem 2rem;
		margin-bottom: 1.75rem;
	}
	.head__text {
		display: flex;
		flex: 1 1 24rem;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}
	.head__title {
		margin: 0;
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-weight: 700;
		font-size: clamp(1.9rem, 3.2vw, 2.7rem);
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.head__lede {
		max-width: 44rem;
		margin: 0;
		color: var(--ink-soft);
	}
	.head__actions {
		display: flex;
		flex: 0 1 auto;
		align-items: center;
		gap: 0.5rem;
	}
	@media (max-width: 760px) {
		.head__actions {
			flex-wrap: wrap;
			width: 100%;
		}
		.head__actions > :global(*) {
			flex: 1 1 auto;
		}
	}
</style>
