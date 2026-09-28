<script lang="ts">
	import { enhance } from '$app/forms';
	import KeyReveal from '$lib/components/console/KeyReveal.svelte';
	import PageHead from '$lib/components/console/PageHead.svelte';
	import SearchBar from '$lib/components/console/SearchBar.svelte';
	import StateChip, { type Tone } from '$lib/components/console/StateChip.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	let { data, form } = $props();

	let editing = $state<string | null>(null);
	let minting = $state(false);

	function stateTone(state: string): Tone {
		switch (state) {
			case 'ACTIVE':
				return 'good';
			case 'GRACE':
			case 'SUSPENDED':
				return 'warn';
			case 'REVOKED':
			case 'EXPIRED':
				return 'crit';
			default:
				return 'neutral';
		}
	}

	function isoDate(value: Date | string | null): string {
		return value ? new Date(value).toISOString().slice(0, 10) : '';
	}
</script>

<svelte:head><title>Licences · ShipTrack Pro</title></svelte:head>

<PageHead code="C02" title="Licences" lede="Mint keys, change what a licence grants, and revoke or restore it.">
	<SearchBar value={data.search} placeholder="Email, name, label or key prefix" label="Search licences" />
	<button
		class="st-btn {minting ? 'st-btn--ghost' : 'st-btn--accent'}"
		type="button"
		aria-expanded={minting}
		aria-controls="mint-form"
		onclick={() => (minting = !minting)}
	>
		{#if minting}Cancel{:else}<Icon name="licences" size={16} /> Mint licence{/if}
	</button>
</PageHead>

{#if form?.message}
	<p class="notice" role="status">{form.message}</p>
{/if}

{#if form?.minted}
	<KeyReveal
		tone="good"
		title="Licence minted for {form.minted.email}"
		note="{form.minted.tier} · {form.minted.seats} seat{form.minted.seats === 1
			? ''
			: 's'}. This is the only time the key is shown: it is stored encrypted and hashed, and reading it back later is an audited reveal."
		value={form.minted.key}
	/>
{/if}

{#if form?.revealed}
	<KeyReveal
		tone="warn"
		title="Key revealed"
		note="This reveal has been written to the audit log under your name."
		value={form.revealed.key}
	/>
{/if}

{#if minting}
	<form
		id="mint-form"
		method="POST"
		action="?/mint"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				minting = false;
			}}
		class="st-panel mint"
	>
		<div class="st-panel__head">
			<h2 class="st-panel__title">New licence</h2>
		</div>
		<div class="st-panel__body fields">
			<label class="st-field">
				<span class="st-label">Customer email</span>
				<input class="st-input" type="email" name="email" required />
			</label>
			<label class="st-field">
				<span class="st-label">Customer name</span>
				<input class="st-input" type="text" name="name" required />
			</label>
			<label class="st-field">
				<span class="st-label">Label (optional)</span>
				<input class="st-input" type="text" name="label" placeholder="e.g. Acme main site" />
			</label>
			<label class="st-field">
				<span class="st-label">Tier</span>
				<select class="st-input" name="tier">
					{#each data.tiers as tier (tier)}<option value={tier}>{tier}</option>{/each}
				</select>
			</label>
			<label class="st-field">
				<span class="st-label">Seats (blank for the tier default)</span>
				<input class="st-input" type="number" name="seats" min="1" />
			</label>
			<label class="st-field">
				<span class="st-label">Expires (blank for lifetime)</span>
				<input class="st-input" type="date" name="expires" />
			</label>
			<div class="fields__submit">
				<button class="st-btn st-btn--accent" type="submit">Mint and show key</button>
			</div>
		</div>
	</form>
{/if}

<!-- Scrolls sideways when a row is wide, so it takes focus for keyboard scrolling. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="st-table-wrap" tabindex="0" role="region" aria-label="Licences">
	<table class="st-table st-table--cards">
		<thead>
			<tr>
				<th scope="col">Key</th>
				<th scope="col">Customer</th>
				<th scope="col">Tier</th>
				<th scope="col">Seats</th>
				<th scope="col">State</th>
				<th scope="col">Expires</th>
				<th scope="col" class="st-end">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.licenses as license (license.id)}
				<tr class:row--open={editing === license.id}>
					<td data-label="Key">
						<div>
							<code class="st-code">{license.keyPrefix}</code>
							{#if license.label}<div class="sub">{license.label}</div>{/if}
						</div>
					</td>
					<td data-label="Customer">
						<div>
							{license.customerName}
							<div class="sub">{license.customerEmail}</div>
						</div>
					</td>
					<td data-label="Tier"><span class="st-chip">{license.tier}</span></td>
					<td data-label="Seats">
						<div class="seats">
							<span class="st-num">{license.seatsUsed} / {license.maxSeats}</span>
							{#if license.seatsUsed >= license.maxSeats}
								<StateChip tone="warn" label="Full" />
							{/if}
						</div>
					</td>
					<td data-label="State"><StateChip tone={stateTone(license.state)} label={license.state} /></td>
					<td data-label="Expires">
						<span class="st-code st-num">{isoDate(license.expiresAt) || 'never'}</span>
					</td>
					<td class="st-end">
						<div class="actions">
							<button
								class="st-btn st-btn--ghost st-btn--sm"
								type="button"
								aria-expanded={editing === license.id}
								onclick={() => (editing = editing === license.id ? null : license.id)}
							>
								{editing === license.id ? 'Close' : 'Edit'}
							</button>
							<form method="POST" action="?/reveal" use:enhance>
								<input type="hidden" name="id" value={license.id} />
								<button class="st-btn st-btn--warn st-btn--sm" type="submit">Reveal</button>
							</form>
							{#if license.status === 'REVOKED'}
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={license.id} />
									<input type="hidden" name="status" value="ACTIVE" />
									<button class="st-btn st-btn--good st-btn--sm" type="submit">Restore</button>
								</form>
							{:else}
								<form method="POST" action="?/status" use:enhance>
									<input type="hidden" name="id" value={license.id} />
									<input type="hidden" name="status" value="REVOKED" />
									<button class="st-btn st-btn--danger st-btn--sm" type="submit">Revoke</button>
								</form>
							{/if}
						</div>
					</td>
				</tr>

				{#if editing === license.id}
					<tr class="edit">
						<td colspan="7">
							<form
								method="POST"
								action="?/update"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										editing = null;
									}}
								class="fields fields--edit"
							>
								<input type="hidden" name="id" value={license.id} />
								<label class="st-field">
									<span class="st-label">Tier</span>
									<select class="st-input" name="tier" value={license.tier}>
										{#each data.tiers as tier (tier)}<option value={tier}>{tier}</option>{/each}
									</select>
								</label>
								<label class="st-field">
									<span class="st-label">Seats</span>
									<input class="st-input" type="number" name="seats" min="1" value={license.maxSeats} />
								</label>
								<label class="st-field">
									<span class="st-label">Expires</span>
									<input class="st-input" type="date" name="expires" value={isoDate(license.expiresAt)} />
								</label>
								<label class="st-field">
									<span class="st-label">Label</span>
									<input class="st-input" type="text" name="label" value={license.label ?? ''} />
								</label>
								<div class="fields__submit">
									<button class="st-btn st-btn--accent" type="submit">Save changes</button>
								</div>
							</form>
						</td>
					</tr>
				{/if}
			{:else}
				<tr>
					<td colspan="7" class="none">
						{data.search ? `No licences match “${data.search}”.` : 'No licences have been minted yet.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.notice {
		margin: 0 0 1.25rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--rule);
		border-left: 4px solid var(--ink-soft);
		background: var(--sheet);
		font-size: 14px;
	}
	.mint {
		margin-bottom: 1.25rem;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}
	.fields--edit {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		padding: 0.25rem 0;
	}
	.fields__submit {
		grid-column: 1 / -1;
	}
	.sub {
		margin-top: 0.15rem;
		color: var(--ink-faint);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.seats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.35rem;
	}
	.row--open td {
		background: var(--sheet-2);
	}
	.edit td {
		background: var(--sheet-2);
		border-bottom: 1px solid var(--rule);
	}
	.none {
		padding: 3rem 1rem;
		color: var(--ink-soft);
		text-align: center;
	}

	@media (max-width: 1000px) {
		.fields,
		.fields--edit {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 760px) {
		.fields,
		.fields--edit {
			grid-template-columns: 1fr;
		}
		.actions {
			justify-content: flex-start;
		}
		.none {
			text-align: left;
		}
	}
</style>
