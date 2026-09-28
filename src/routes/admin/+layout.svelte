<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import Mark from '$lib/ui/Mark.svelte';

	let { data, children } = $props();

	// Route ids, passed through resolve() where they become hrefs: it
	// type-checks the route against the router and survives a base path,
	// which a hand-written href does not.
	const links = [
		{ path: '/admin', label: 'Overview', icon: 'overview' },
		{ path: '/admin/licenses', label: 'Licences', icon: 'licences' },
		{ path: '/admin/seats', label: 'Seats', icon: 'seats' },
		{ path: '/admin/releases', label: 'Releases', icon: 'releases' },
		{ path: '/admin/audit', label: 'Audit', icon: 'audit' }
	] as const satisfies readonly { path: string; label: string; icon: IconName }[];

	const home = resolve('/admin');

	// Exact match for the index, prefix match for the rest, so /admin does not
	// light up on every page.
	function isActive(href: string): boolean {
		return href === home ? page.url.pathname === home : page.url.pathname.startsWith(href);
	}

	const current = $derived(links.find((link) => isActive(resolve(link.path))));
</script>

<div class="st-console console">
	{#if page.url.pathname === resolve('/admin/login')}
		{@render children()}
	{:else}
		<a class="skip" href="#console-main">Skip to content</a>

		<header class="bar">
			<a href={home} class="bar__brand" aria-label="ShipTrack console, overview">
				<Mark size={28} tone="dark" />
				<span class="bar__word">ShipTrack</span>
				<span class="bar__badge">Console</span>
			</a>

			<!--
				One nav, two layouts: tabs in the top bar on a desk, a fixed bar of
				icons along the bottom edge on a phone, where a thumb can reach it.
			-->
			<nav class="tabs" aria-label="Console">
				{#each links as link (link.path)}
					<a
						href={resolve(link.path)}
						class="tab"
						aria-current={isActive(resolve(link.path)) ? 'page' : undefined}
					>
						<Icon name={link.icon} size={18} />
						<span class="tab__label">{link.label}</span>
					</a>
				{/each}
			</nav>

			<form method="POST" action="/admin/logout" class="bar__out">
				<button class="st-btn st-btn--ghost st-btn--sm" type="submit">
					<Icon name="logout" size={16} />
					<span class="bar__out-label">Sign out</span>
				</button>
			</form>
		</header>

		<div class="strip">
			<p class="strip__crumb st-label">
				<span>Console</span>
				<span aria-hidden="true">/</span>
				<span class="strip__here">{current?.label ?? ''}</span>
			</p>
			<p class="strip__who st-label">
				<span class="strip__dot" aria-hidden="true"></span>
				Signed in as <span class="strip__email">{data.admin?.email}</span>
			</p>
		</div>

		<main id="console-main" class="main">
			{@render children()}
		</main>
	{/if}
</div>

<style>
	.console {
		min-height: 100svh;
	}

	.skip {
		position: absolute;
		top: -100px;
		left: 1rem;
		z-index: 60;
		padding: 0.6rem 1rem;
		background: var(--mint);
		color: var(--mint-ink);
		font-weight: 600;
		text-decoration: none;
	}
	.skip:focus {
		top: 0.75rem;
	}

	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		align-items: stretch;
		gap: 2rem;
		height: 56px;
		padding: 0 1.25rem;
		border-bottom: 1px solid var(--rule);
		background: color-mix(in oklab, var(--bg) 94%, transparent);
		backdrop-filter: blur(8px);
	}
	.bar__brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--ink);
		text-decoration: none;
	}
	.bar__word {
		font-family: var(--font-display);
		font-stretch: 118%;
		font-size: 17px;
		font-weight: 700;
	}
	.bar__badge {
		padding: 2px 6px;
		border: 1px solid var(--rule);
		color: var(--ink-soft);
		font: 400 10px/1.2 var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.tabs {
		display: flex;
		align-items: stretch;
		gap: 0.25rem;
	}
	.tab {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.8rem;
		color: var(--ink-soft);
		font-size: 14px;
		text-decoration: none;
		transition: color 140ms var(--ease-out);
	}
	.tab:hover {
		color: var(--ink);
	}
	.tab[aria-current='page'] {
		color: var(--ink);
	}
	/* The active tab is marked by a mint rule on the bar's own edge. */
	.tab[aria-current='page']::after {
		content: '';
		position: absolute;
		right: 0.8rem;
		bottom: -1px;
		left: 0.8rem;
		height: 2px;
		background: var(--mint);
	}

	.bar__out {
		display: flex;
		align-items: center;
		margin-left: auto;
	}

	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		min-height: 34px;
		padding: 0.4rem 1.25rem;
		border-bottom: 1px dashed var(--rule);
		background-image: repeating-linear-gradient(
			135deg,
			var(--rule-soft) 0 1px,
			transparent 1px 7px
		);
	}
	.strip p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 11px;
	}
	.strip__here {
		color: var(--ink);
	}
	.strip__dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--con-good);
	}
	.strip__email {
		color: var(--ink);
		text-transform: none;
		letter-spacing: 0.02em;
	}

	.main {
		max-width: 1320px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}

	@media (max-width: 860px) {
		/*
		 * No backdrop-filter here: it makes the bar the containing block for
		 * its fixed descendants, and the tab bar below would then pin itself
		 * to the header instead of to the bottom of the screen.
		 */
		.bar {
			gap: 1rem;
			background: var(--bg);
			backdrop-filter: none;
		}
		/*
		 * The tabs leave the top bar for a fixed bar along the bottom: five
		 * equal cells, icon over label, the active one ruled in mint on top.
		 */
		.tabs {
			position: fixed;
			right: 0;
			bottom: 0;
			left: 0;
			z-index: 50;
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: 0;
			padding-bottom: env(safe-area-inset-bottom);
			border-top: 1px solid var(--rule);
			background: var(--sheet);
		}
		.tab {
			flex-direction: column;
			justify-content: center;
			gap: 0.3rem;
			min-height: 60px;
			padding: 0.4rem 0;
		}
		.tab__label {
			font: 400 10px/1 var(--font-mono);
			letter-spacing: 0.06em;
			text-transform: uppercase;
		}
		.tab[aria-current='page']::after {
			top: -1px;
			bottom: auto;
			right: 22%;
			left: 22%;
		}
		.main {
			padding: 1.5rem 1rem calc(6rem + env(safe-area-inset-bottom));
		}
	}

	@media (max-width: 520px) {
		.bar__out-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.strip__who {
			display: none !important;
		}
	}
</style>
