<script lang="ts">
	import { resolve } from '$app/paths';
	import Mark from '$lib/ui/Mark.svelte';
</script>

<header class="nav">
	<div class="nav__inner">
		<a href={resolve('/')} class="nav__brand" aria-label="ShipTrack Pro, home">
			<Mark size={30} />
			<span class="nav__word">ShipTrack<span class="nav__pro">Pro</span></span>
		</a>

		<nav class="nav__links" aria-label="Page sections">
			<!-- Literal fragments: the resolve() lint rule cannot follow them through an each. -->
			<a href="#route" class="st-label nav__link">How it works</a>
			<a href="#check" class="st-label nav__link">Tracking check</a>
			<a href="#modules" class="st-label nav__link">Modules</a>
			<a href="#pricing" class="st-label nav__link">Pricing</a>
			<a href="#faq" class="st-label nav__link">FAQ</a>
		</nav>

		<div class="nav__actions">
			<a href={resolve('/portal')} class="st-btn st-btn--tag st-btn--ink st-btn--sm">
				<span class="nav__long">Licence portal</span><span class="nav__short">Portal</span>
			</a>
			<a href="#pricing" class="st-btn st-btn--tag st-btn--mint st-btn--sm nav__pricing">See pricing</a>
		</div>
	</div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 40;
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--rule);
	}
	.nav__inner {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		max-width: 1216px;
		height: 60px;
		margin: 0 auto;
		padding: 0 1.25rem;
	}
	.nav__brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--ink);
		text-decoration: none;
	}
	.nav__word {
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.nav__pro {
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
	.nav__links {
		display: flex;
		gap: 1.6rem;
		margin: 0 auto;
	}
	.nav__link {
		color: var(--ink-soft);
		text-decoration: none;
		transition: color 140ms var(--st-ease-out);
	}
	.nav__link:hover {
		color: var(--ink);
	}
	.nav__actions {
		display: flex;
		gap: 0.35rem;
	}
	.nav__short {
		display: none;
	}

	@media (max-width: 960px) {
		.nav__links {
			display: none;
		}
		.nav__actions {
			margin-left: auto;
		}
	}
	/* Two tag buttons and the wordmark overflow a phone; the hero repeats "See pricing". */
	@media (max-width: 480px) {
		.nav__pricing {
			display: none;
		}
		.nav__long {
			display: none;
		}
		.nav__short {
			display: inline;
		}
		.nav__word {
			font-size: 16px;
		}
	}
</style>
