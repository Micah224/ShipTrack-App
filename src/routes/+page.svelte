<script lang="ts">
	import { resolve } from '$app/paths';
	import { FEATURE_COPY, GROUP_ORDER, featureLabel } from '$lib/features';

	let { data } = $props();

	const tiers = $derived(data.tiers);

	/** Every flag any tier grants, grouped, in the order defined in features.ts. */
	const rows = $derived.by(() => {
		const all = [...new Set(tiers.flatMap((t) => t.features))];
		return GROUP_ORDER.flatMap((group) => {
			const flags = all.filter((f) => FEATURE_COPY[f]?.group === group);
			return flags.length ? [{ group, flags }] : [];
		});
	});

	function cap(value: number | null, unlimited = 'Unlimited'): string {
		return value === null ? unlimited : String(value);
	}
</script>

<svelte:head>
	<title>ShipTrack Pro — shipment tracking for WordPress</title>
	<meta
		name="description"
		content="Road, rail, sea and air shipment tracking for WordPress, with a public tracking page your customers can use and licence management built in."
	/>
</svelte:head>

<div class="flex flex-col">
	<!-- Hero -->
	<section class="bg-surface-100-900 border-surface-200-800 border-b">
		<div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16 md:py-24">
			<p class="text-primary-600-400 text-sm font-semibold tracking-wide uppercase">
				WordPress plugin
			</p>
			<h1 class="h1 max-w-3xl">Shipment tracking your customers can actually follow.</h1>
			<p class="max-w-2xl text-lg opacity-80">
				ShipTrack Pro adds road, rail, sea and air shipments to WordPress, with a public tracking
				page, notifications and an audit trail. Licences activate in a minute and update through
				WordPress's own plugin updater.
			</p>
			<div class="flex flex-wrap gap-3">
				<a href="#pricing" class="btn preset-filled-primary-500">See pricing</a>
				<a href={resolve('/portal')} class="btn preset-outlined-surface-500">
					Manage my licence
				</a>
			</div>
		</div>
	</section>

	<!-- Pricing -->
	<section id="pricing" class="mx-auto w-full max-w-5xl px-6 py-16">
		<h2 class="h3 mb-2">Pricing</h2>
		<p class="mb-8 opacity-70">
			Every licence includes updates for the year and the public tracking page. Seats are
			production sites — staging, local and managed-host previews never consume one.
		</p>

		<div class="grid gap-6 md:grid-cols-3">
			{#each tiers as tier (tier.tier)}
				<div
					class="card flex flex-col gap-4 p-6 {tier.tier === 'PROFESSIONAL'
						? 'preset-outlined-primary-500'
						: 'preset-outlined-surface-200-800'}"
				>
					<div>
						<div class="flex items-center gap-2">
							<h3 class="h4">{tier.name}</h3>
							{#if tier.tier === 'PROFESSIONAL'}
								<span class="badge preset-filled-primary-500 text-xs">Most chosen</span>
							{/if}
						</div>
						<p class="mt-2 flex items-baseline gap-1">
							<span class="text-3xl font-bold">{tier.price}</span>
							<span class="text-sm opacity-60">{tier.cadence}</span>
						</p>
					</div>

					<p class="text-sm opacity-80">{tier.pitch}</p>

					<dl class="border-surface-200-800 grid grid-cols-2 gap-2 border-t pt-4 text-sm">
						<dt class="opacity-60">Production sites</dt>
						<dd class="text-right font-semibold">{tier.seats}</dd>
						<dt class="opacity-60">Custom branches</dt>
						<dd class="text-right font-semibold">{cap(tier.limits.branches)}</dd>
						<dt class="opacity-60">Audit retention</dt>
						<dd class="text-right font-semibold">
							{tier.limits.auditRetentionDays === null
								? 'Full'
								: tier.limits.auditRetentionDays === 0
									? 'Current only'
									: `${tier.limits.auditRetentionDays} days`}
						</dd>
					</dl>
				</div>
			{/each}
		</div>
	</section>

	<!-- Comparison -->
	<section class="bg-surface-100-900 border-surface-200-800 border-y">
		<div class="mx-auto w-full max-w-5xl px-6 py-16">
			<h2 class="h3 mb-2">What each tier includes</h2>
			<p class="mb-8 text-sm opacity-70">
				Generated from the entitlement matrix the licence server issues from, so this table cannot
				disagree with what your site actually receives.
			</p>

			<div class="overflow-x-auto">
				<table class="table w-full min-w-[36rem]">
					<thead>
						<tr>
							<th class="text-left">Capability</th>
							{#each tiers as tier (tier.tier)}
								<th class="text-center">{tier.name}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.group)}
							<tr class="bg-surface-200-800">
								<th colspan={tiers.length + 1} class="text-left text-xs tracking-wide uppercase">
									{row.group}
								</th>
							</tr>
							{#each row.flags as flag (flag)}
								<tr>
									<td>{featureLabel(flag)}</td>
									{#each tiers as tier (tier.tier)}
										<td class="text-center">
											{#if tier.features.includes(flag)}
												<span class="text-success-600-400" aria-label="Included">✓</span>
											{:else}
												<span class="opacity-30" aria-label="Not included">—</span>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>

	<!-- Existing customers -->
	<section class="mx-auto w-full max-w-5xl px-6 py-16">
		<div class="card preset-outlined-surface-200-800 flex flex-col gap-4 p-8">
			<h2 class="h4">Already have a licence?</h2>
			<p class="max-w-2xl opacity-80">
				Sign in with your licence key to see which sites are using your seats, free one up when you
				retire a site, and check what your licence includes.
			</p>
			<div>
				<a href={resolve('/portal')} class="btn preset-filled-primary-500">Open the portal</a>
			</div>
		</div>
	</section>
</div>
