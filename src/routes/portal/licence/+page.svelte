<script lang="ts">
	import { FEATURE_COPY, GROUP_ORDER, featureLabel } from '$lib/features';

	let { data, form } = $props();

	const licence = $derived(data.missing ? null : data.licence);
	const installs = $derived(data.missing ? [] : data.installs);

	const live = $derived(installs.filter((i) => i.releasedAt === null));
	const released = $derived(installs.filter((i) => i.releasedAt !== null));

	const grouped = $derived.by(() => {
		if (!licence) return [];
		return GROUP_ORDER.flatMap((group) => {
			const flags = licence.features.filter((f) => FEATURE_COPY[f]?.group === group);
			return flags.length ? [{ group, flags }] : [];
		});
	});

	/* The state a customer sees is the one the plugin computes, not the raw status. */
	const stateCopy: Record<string, { badge: string; says: string }> = {
		ACTIVE: { badge: 'preset-filled-success-500', says: 'Your licence is active.' },
		GRACE: {
			badge: 'preset-filled-warning-500',
			says: 'Your sites are running on the grace period. Renew to avoid interruption.'
		},
		EXPIRED: {
			badge: 'preset-filled-error-500',
			says: 'This licence has expired. Existing tracking pages keep working; new shipments do not.'
		},
		SUSPENDED: { badge: 'preset-filled-error-500', says: 'This licence is suspended.' },
		REVOKED: { badge: 'preset-filled-error-500', says: 'This licence has been revoked.' }
	};

	function when(value: string | Date | null): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function staleness(lastHeartbeat: string | Date | null): string {
		if (!lastHeartbeat) return 'never checked in';
		const days = Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 86_400_000);
		if (days <= 0) return 'checked in today';
		if (days === 1) return 'checked in yesterday';
		return `checked in ${days} days ago`;
	}
</script>

<svelte:head><title>Your licence — ShipTrack Pro</title></svelte:head>

{#if data.missing}
	<div class="mx-auto max-w-2xl p-6">
		<div class="card preset-outlined-error-500 p-6">
			<h1 class="h4 mb-2">This licence is no longer on file</h1>
			<p class="text-sm opacity-80">
				Your session refers to a licence that has since been removed. Please contact support.
			</p>
		</div>
	</div>
{:else if licence}
	<div class="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
		<header class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="h3">Your licence</h1>
				<p class="mt-1 font-mono text-sm opacity-70">{licence.keyPrefix}-••••-••••-••••</p>
			</div>
			<form method="POST" action="/portal/logout">
				<button class="btn btn-sm preset-outlined-surface-500" type="submit">Sign out</button>
			</form>
		</header>

		{#if form?.released}
			<p class="card preset-filled-success-500 p-4 text-sm" role="status">
				Freed the seat used by {form.released}. It is available immediately.
			</p>
		{:else if form?.message}
			<p class="card preset-filled-error-500 p-4 text-sm" role="alert">{form.message}</p>
		{/if}

		<!-- Status -->
		<section class="card preset-outlined-surface-200-800 flex flex-col gap-4 p-6">
			<div class="flex flex-wrap items-center gap-3">
				<span class="badge {stateCopy[licence.state]?.badge ?? 'preset-filled-surface-500'}">
					{licence.state}
				</span>
				<span class="badge preset-outlined-surface-500">{licence.tier}</span>
				<p class="text-sm opacity-80">{stateCopy[licence.state]?.says ?? ''}</p>
			</div>

			<dl class="grid gap-4 sm:grid-cols-3">
				<div>
					<dt class="text-sm opacity-60">Production seats</dt>
					<dd class="text-2xl font-bold">{licence.seatsUsed} / {licence.maxSeats}</dd>
				</div>
				<div>
					<dt class="text-sm opacity-60">Renews</dt>
					<dd class="text-2xl font-bold">{licence.expiresAt ? when(licence.expiresAt) : 'Never'}</dd>
				</div>
				<div>
					<dt class="text-sm opacity-60">Custom branches</dt>
					<dd class="text-2xl font-bold">{licence.limits.branches ?? 'Unlimited'}</dd>
				</div>
			</dl>
		</section>

		<!-- Sites -->
		<section class="flex flex-col gap-3">
			<div>
				<h2 class="h4">Your sites</h2>
				<p class="text-sm opacity-70">
					Only production sites use a seat. Staging, local and managed-host previews are free, and
					a site that stops checking in for {data.reclaimAfterDays} days releases its seat automatically.
				</p>
			</div>

			{#if live.length === 0}
				<p class="card preset-outlined-surface-200-800 p-6 text-sm opacity-70">
					No sites are using this licence yet. Paste your key into ShipTrack Pro → Licence in your
					WordPress admin.
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="table w-full min-w-[40rem]">
						<thead>
							<tr>
								<th class="text-left">Site</th>
								<th class="text-left">Environment</th>
								<th class="text-left">Plugin</th>
								<th class="text-left">Last seen</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each live as install (install.id)}
								<tr>
									<td class="font-medium">{install.domain}</td>
									<td>
										<span class="badge preset-outlined-surface-500 text-xs">
											{install.environment}
										</span>
										{#if !install.countsSeat}
											<span class="ml-1 text-xs opacity-60">no seat</span>
										{/if}
									</td>
									<td class="text-sm opacity-70">
										{install.pluginVersion ?? '—'}
										{#if install.wpVersion}<span class="opacity-50"> · WP {install.wpVersion}</span
											>{/if}
									</td>
									<td class="text-sm opacity-70">{staleness(install.lastHeartbeat)}</td>
									<td class="text-right">
										{#if install.countsSeat}
											<form method="POST" action="?/release">
												<input type="hidden" name="activation_id" value={install.id} />
												<button class="btn btn-sm preset-outlined-error-500" type="submit">
													Free this seat
												</button>
											</form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if released.length > 0}
				<details class="card preset-outlined-surface-200-800 p-4">
					<summary class="cursor-pointer text-sm font-medium">
						{released.length} released site{released.length === 1 ? '' : 's'}
					</summary>
					<ul class="mt-3 flex flex-col gap-1 text-sm opacity-70">
						{#each released as install (install.id)}
							<li>
								{install.domain} — released {when(install.releasedAt)}
								<span class="opacity-60">({install.releaseReason})</span>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>

		<!-- What it includes -->
		<section class="flex flex-col gap-3">
			<h2 class="h4">What your licence includes</h2>
			<div class="card preset-outlined-surface-200-800 grid gap-6 p-6 sm:grid-cols-2">
				{#each grouped as row (row.group)}
					<div>
						<h3 class="mb-2 text-xs font-semibold tracking-wide uppercase opacity-60">
							{row.group}
						</h3>
						<ul class="flex flex-col gap-1 text-sm">
							{#each row.flags as flag (flag)}
								<li><span class="text-success-600-400">✓</span> {featureLabel(flag)}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>
	</div>
{/if}
