<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';

	interface Props {
		/** SUPPORT_EMAIL, when configured and plainly an address. */
		supportEmail: string | null;
	}

	let { supportEmail }: Props = $props();

	/*
	 * Answers restate how the platform behaves; none of them promise anything
	 * the code does not do. Native <details>, so it works without JavaScript and
	 * every answer is in the document for search and screen readers.
	 */
	const faqs: { q: string; a: string; contact?: boolean }[] = [
		{
			q: 'What counts as a seat?',
			a: 'A production site. Staging copies, managed-host previews and local installs are recognised automatically and never use one; the table above lists exactly how.'
		},
		{
			q: 'What happens when my licence expires?',
			a: "Your customers' tracking page keeps working. Google Maps falls back to OpenStreetMap and rail and sea to an indicative route, and creating or editing shipments waits until you renew."
		},
		{
			q: 'Can I move a licence to a new site?',
			a: "Yes. Free the old site's seat from the licence portal, then activate the licence on the new one."
		},
		{
			q: 'How do updates arrive?',
			a: "Through WordPress's own plugin updater, like any other plugin, for the year your licence covers."
		},
		{
			q: 'I have lost my licence key.',
			a: 'Keys are stored encrypted, so the same key can be looked up and sent to you again, and every site already activated with it keeps working.',
			contact: true
		},
		{
			q: 'What does it need to run?',
			a: 'WordPress 6.5 or later and PHP 8.1 or later.'
		}
	];
</script>

<section id="faq" class="faq" aria-labelledby="faq-title">
	<h2 id="faq-title" class="st-display faq__title">FAQ</h2>
	<div class="faq__list">
		{#each faqs as item (item.q)}
			<details class="faq__item">
				<summary>
					<span>{item.q}</span>
					<span class="faq__chev"><Icon name="chevron" size={18} /></span>
				</summary>
				<p>
					{#if item.contact}
						<!-- The way to ask comes first; without an address, point at the seller. -->
						{#if supportEmail}
							Email <a href="mailto:{supportEmail}">{supportEmail}</a>.
						{:else}
							Ask whoever sold you the licence.
						{/if}
					{/if}
					{item.a}
				</p>
			</details>
		{/each}
	</div>
</section>

<style>
	.faq {
		padding: 5rem 1.5rem 6rem;
	}
	.faq__title {
		margin: 0 0 2.5rem;
		text-align: center;
		font-size: clamp(2.6rem, 5.5vw, 4.4rem);
	}
	.faq__list {
		max-width: 44rem;
		margin: 0 auto;
	}
	.faq__item {
		border-bottom: 1px dashed var(--rule);
	}
	.faq__item summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.1rem 0;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}
	.faq__item summary::-webkit-details-marker {
		display: none;
	}
	.faq__chev {
		transition: transform 200ms var(--ease-out);
	}
	.faq__item[open] .faq__chev {
		transform: rotate(180deg);
	}
	.faq__item p {
		margin: 0 0 1.2rem;
		max-width: 38rem;
		color: var(--ink-soft);
	}

	@media (max-width: 600px) {
		.faq {
			padding: 4rem 1.25rem 4.5rem;
		}
	}
</style>
