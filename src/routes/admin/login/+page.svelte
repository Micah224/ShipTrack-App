<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · ShipTrack Pro</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-6">
	<div class="card preset-outlined-surface-200-800 w-full max-w-sm p-8">
		<h1 class="h3 mb-1">ShipTrack Pro</h1>
		<p class="mb-6 text-sm opacity-70">Licensing console</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="flex flex-col gap-4"
		>
			<label class="label">
				<span class="label-text">Email</span>
				<input
					class="input"
					type="email"
					name="email"
					autocomplete="username"
					value={form?.email ?? ''}
					required
				/>
			</label>

			<label class="label">
				<span class="label-text">Password</span>
				<input class="input" type="password" name="password" autocomplete="current-password" required />
			</label>

			{#if form?.message}
				<p class="text-error-600-400 text-sm" role="alert">{form.message}</p>
			{/if}

			<button class="btn preset-filled-primary-500" type="submit" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	</div>
</div>
