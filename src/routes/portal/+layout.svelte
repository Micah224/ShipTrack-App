<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/ui/Icon.svelte';
	import Mark from '$lib/ui/Mark.svelte';

	let { data, children } = $props();
</script>

<!--
	The portal wears the landing page's light sheet, not the console's dark one:
	it is the customer's side of the product, reached from the site.
-->
<div class="st-site portal">
	<a class="skip" href="#portal-main">Skip to content</a>

	<header class="bar">
		<div class="bar__inner">
			<a href={resolve('/')} class="bar__brand" aria-label="ShipTrack Pro, home">
				<Mark size={28} />
				<span class="bar__word">ShipTrack<span class="bar__pro">Pro</span></span>
			</a>
			<span class="st-label bar__where">Licence portal</span>

			<div class="bar__actions">
				<a href={resolve('/')} class="st-label bar__link">Back to the site</a>
				{#if data.signedIn}
					<form method="POST" action="/portal/logout">
						<button class="st-btn st-btn--tag st-btn--ink st-btn--sm" type="submit">
							<Icon name="logout" size={14} />
							Sign out
						</button>
					</form>
				{/if}
			</div>
		</div>
	</header>

	<main id="portal-main" class="main">
		{@render children()}
	</main>

	<footer class="foot">
		<div class="foot__inner">
			<p class="st-label">© {new Date().getFullYear()} ShipTrack Pro</p>
			{#if data.supportEmail}
				<a href="mailto:{data.supportEmail}" class="st-label foot__link">Support</a>
			{/if}
		</div>
	</footer>
</div>

<style>
	.portal {
		display: flex;
		flex-direction: column;
		min-height: 100svh;
	}

	.skip {
		position: absolute;
		top: -100px;
		left: 1rem;
		z-index: 60;
		padding: 0.6rem 1rem;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
		text-decoration: none;
	}
	.skip:focus {
		top: 0.75rem;
	}

	.bar {
		border-bottom: 1px solid var(--rule);
		background: var(--bg);
	}
	.bar__inner {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 1216px;
		height: 60px;
		margin: 0 auto;
		padding: 0 1.25rem;
	}
	.bar__brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--ink);
		text-decoration: none;
	}
	.bar__word {
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.bar__pro {
		margin-left: 0.35em;
		padding: 1px 5px;
		background: var(--ink);
		color: var(--bg);
		font-family: var(--st-font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		vertical-align: 3px;
	}
	.bar__where {
		padding-left: 1rem;
		border-left: 1px solid var(--rule);
	}
	.bar__actions {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-left: auto;
	}
	.bar__link {
		color: var(--ink-soft);
		text-decoration: none;
	}
	.bar__link:hover {
		color: var(--ink);
	}

	.main {
		flex: 1;
		width: 100%;
		max-width: 1216px;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
	}

	.foot {
		border-top: 1px dashed var(--rule);
	}
	.foot__inner {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		max-width: 1216px;
		margin: 0 auto;
		padding: 1rem 1.25rem 1.4rem;
	}
	.foot__inner p {
		margin: 0;
	}
	.foot__link {
		color: var(--ink);
	}

	@media (max-width: 640px) {
		.bar__where,
		.bar__link {
			display: none;
		}
		.main {
			padding: 1.75rem 1rem 3rem;
		}
	}
</style>
