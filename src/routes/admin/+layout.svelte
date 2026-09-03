<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { data, children } = $props();

	// resolve() rather than bare strings: it type-checks the route against the
	// router and survives a base path, which a hand-written href does not.
	const links = [
		{ href: resolve('/admin'), label: 'Overview' },
		{ href: resolve('/admin/licenses'), label: 'Licences' },
		{ href: resolve('/admin/seats'), label: 'Seats' },
		{ href: resolve('/admin/releases'), label: 'Releases' },
		{ href: resolve('/admin/audit'), label: 'Audit' }
	];

	const home = resolve('/admin');

	// Exact match for the index, prefix match for the rest, so /admin does not
	// light up on every page.
	function isActive(href: string): boolean {
		return href === home ? page.url.pathname === home : page.url.pathname.startsWith(href);
	}
</script>

{#if page.url.pathname === resolve('/admin/login')}
	{@render children()}
{:else}
	<div class="grid min-h-screen grid-rows-[auto_1fr]">
		<header
			class="bg-primary-500 text-primary-contrast-500 flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3"
		>
			<a href={home} class="text-lg font-bold tracking-tight">ShipTrack Pro</a>

			<nav class="flex flex-wrap gap-1" aria-label="Console">
				{#each links as link (link.href)}
					<a
						href={link.href}
						class="rounded px-3 py-1.5 text-sm transition-opacity hover:opacity-100
							{isActive(link.href) ? 'bg-secondary-500 text-secondary-contrast-500 font-semibold' : 'opacity-80'}"
						aria-current={isActive(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				{/each}
			</nav>

			<div class="ml-auto flex items-center gap-3 text-sm">
				<span class="opacity-80">{data.admin?.email}</span>
				<form method="POST" action="/admin/logout">
					<button class="btn btn-sm preset-outlined-surface-50-950" type="submit">Sign out</button>
				</form>
			</div>
		</header>

		<main class="p-6">
			{@render children()}
		</main>
	</div>
{/if}
