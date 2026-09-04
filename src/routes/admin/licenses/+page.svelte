<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let editing = $state<string | null>(null);
	let minting = $state(false);

	function stateBadge(state: string): string {
		switch (state) {
			case 'ACTIVE':
				return 'preset-filled-success-500';
			case 'GRACE':
				return 'preset-filled-warning-500';
			case 'REVOKED':
				return 'preset-filled-error-500';
			default:
				return 'preset-tonal-surface';
		}
	}

	function isoDate(value: Date | string | null): string {
		return value ? new Date(value).toISOString().slice(0, 10) : '';
	}
</script>

<svelte:head><title>Licences · ShipTrack Pro</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center gap-4">
	<h1 class="h4">Licences</h1>
	<form method="GET" class="flex gap-2">
		<input class="input" type="search" name="q" placeholder="Search email, name or prefix" value={data.search} />
		<button class="btn preset-outlined-surface-200-800" type="submit">Search</button>
	</form>
	<button class="btn preset-filled-primary-500 ml-auto" onclick={() => (minting = !minting)}>
		{minting ? 'Cancel' : 'Mint licence'}
	</button>
</div>

{#if form?.message}
	<p class="card preset-tonal-primary mb-4 p-3 text-sm" role="status">{form.message}</p>
{/if}

{#if form?.minted}
	<div class="card preset-filled-success-500 mb-6 p-5">
		<h2 class="h6 mb-2">Licence minted for {form.minted.email}</h2>
		<p class="mb-3 text-sm">
			{form.minted.tier} · {form.minted.seats} seat(s). This is the only time the key is shown —
			it is stored encrypted and hashed, so it cannot be read back from the database without an
			audited reveal.
		</p>
		<code class="block rounded bg-black/20 p-3 font-mono text-lg tracking-wider select-all">
			{form.minted.key}
		</code>
	</div>
{/if}

{#if form?.revealed}
	<div class="card preset-filled-warning-500 mb-6 p-5">
		<h2 class="h6 mb-2">Key revealed</h2>
		<p class="mb-3 text-sm">This reveal has been written to the audit log.</p>
		<code class="block rounded bg-black/20 p-3 font-mono text-lg tracking-wider select-all">
			{form.revealed.key}
		</code>
	</div>
{/if}

{#if minting}
	<form
		method="POST"
		action="?/mint"
		use:enhance={() => async ({ update }) => { await update(); minting = false; }}
		class="card preset-outlined-surface-200-800 mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
	>
		<label class="label"><span class="label-text">Customer email</span>
			<input class="input" type="email" name="email" required /></label>
		<label class="label"><span class="label-text">Customer name</span>
			<input class="input" type="text" name="name" required /></label>
		<label class="label"><span class="label-text">Label (optional)</span>
			<input class="input" type="text" name="label" placeholder="e.g. Acme main site" /></label>
		<label class="label"><span class="label-text">Tier</span>
			<select class="select" name="tier">
				{#each data.tiers as tier (tier)}<option value={tier}>{tier}</option>{/each}
			</select></label>
		<label class="label"><span class="label-text">Seats (blank = tier default)</span>
			<input class="input" type="number" name="seats" min="1" /></label>
		<label class="label"><span class="label-text">Expires (blank = lifetime)</span>
			<input class="input" type="date" name="expires" /></label>
		<div class="sm:col-span-2 lg:col-span-3">
			<button class="btn preset-filled-primary-500" type="submit">Mint and show key</button>
		</div>
	</form>
{/if}

<div class="table-wrap">
	<table class="table">
		<thead>
			<tr>
				<th>Key</th><th>Customer</th><th>Tier</th><th>Seats</th>
				<th>State</th><th>Expires</th><th class="text-right">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.licenses as license (license.id)}
				<tr>
					<td>
						<code class="text-sm">{license.keyPrefix}</code>
						{#if license.label}<div class="text-xs opacity-60">{license.label}</div>{/if}
					</td>
					<td>
						{license.customerName}
						<div class="text-xs opacity-60">{license.customerEmail}</div>
					</td>
					<td><span class="badge preset-tonal-primary">{license.tier}</span></td>
					<td>
						{license.seatsUsed} / {license.maxSeats}
						{#if license.seatsUsed >= license.maxSeats}
							<span class="badge preset-tonal-warning ml-1 text-xs">full</span>
						{/if}
					</td>
					<td><span class="badge {stateBadge(license.state)}">{license.state}</span></td>
					<td class="text-sm">{isoDate(license.expiresAt) || 'never'}</td>
					<td class="text-right">
						<div class="flex flex-wrap justify-end gap-1">
							<button
								class="btn btn-sm preset-outlined-surface-200-800"
								onclick={() => (editing = editing === license.id ? null : license.id)}
							>
								{editing === license.id ? 'Close' : 'Edit'}
							</button>
							<form method="POST" action="?/reveal" use:enhance>
								<input type="hidden" name="id" value={license.id} />
								<button class="btn btn-sm preset-outlined-warning-500" type="submit">Reveal</button>
							</form>
							{#if license.status === 'REVOKED'}
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={license.id} />
									<input type="hidden" name="status" value="ACTIVE" />
									<button class="btn btn-sm preset-outlined-success-500" type="submit">Restore</button>
								</form>
							{:else}
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={license.id} />
									<input type="hidden" name="status" value="REVOKED" />
									<button class="btn btn-sm preset-filled-error-500" type="submit">Revoke</button>
								</form>
							{/if}
						</div>
					</td>
				</tr>

				{#if editing === license.id}
					<tr>
						<td colspan="7" class="bg-surface-100-900">
							<form
								method="POST"
								action="?/update"
								use:enhance={() => async ({ update }) => { await update(); editing = null; }}
								class="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4"
							>
								<input type="hidden" name="id" value={license.id} />
								<label class="label"><span class="label-text">Tier</span>
									<select class="select" name="tier" value={license.tier}>
										{#each data.tiers as tier (tier)}<option value={tier}>{tier}</option>{/each}
									</select></label>
								<label class="label"><span class="label-text">Seats</span>
									<input class="input" type="number" name="seats" min="1" value={license.maxSeats} /></label>
								<label class="label"><span class="label-text">Expires</span>
									<input class="input" type="date" name="expires" value={isoDate(license.expiresAt)} /></label>
								<label class="label"><span class="label-text">Label</span>
									<input class="input" type="text" name="label" value={license.label ?? ''} /></label>
								<div class="sm:col-span-2 lg:col-span-4">
									<button class="btn preset-filled-primary-500" type="submit">Save changes</button>
								</div>
							</form>
						</td>
					</tr>
				{/if}
			{:else}
				<tr><td colspan="7" class="py-8 text-center opacity-60">No licences match.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
