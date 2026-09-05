<script lang="ts">
	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Sign in — ShipTrack Pro</title></svelte:head>

<div class="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 p-6">
	<header class="flex flex-col gap-2">
		<h1 class="h3">Manage your licence</h1>
		<p class="text-sm opacity-70">
			Sign in with the licence key from your purchase confirmation — the same key your site uses.
		</p>
	</header>

	<form method="POST" class="card preset-outlined-surface-200-800 flex flex-col gap-4 p-6"
		onsubmit={() => (busy = true)}>
		{#if data.next}<input type="hidden" name="next" value={data.next} />{/if}

		<label class="label">
			<span class="label-text">Licence key</span>
			<input
				class="input font-mono"
				name="key"
				type="text"
				autocomplete="off"
				spellcheck="false"
				placeholder="STP-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
				required
			/>
		</label>

		{#if form?.message}
			<p class="text-error-600-400 text-sm" role="alert">{form.message}</p>
		{/if}

		<button class="btn preset-filled-primary-500" type="submit" disabled={busy}>
			{busy ? 'Checking…' : 'Sign in'}
		</button>

		<p class="text-xs opacity-60">
			Lost your key? It is in your purchase confirmation email. We store only a hash of it, so it
			cannot be recovered from here — contact support and we will re-issue.
		</p>
	</form>
</div>
