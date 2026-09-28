<script lang="ts">
	import { enhance } from '$app/forms';
	import Container from '$lib/ui/Container.svelte';
	import { bounds, type Box } from '$lib/ui/iso';
	import Mark from '$lib/ui/Mark.svelte';

	let { form } = $props();
	let submitting = $state(false);

	/*
	 * A short stack of containers beside the form, in the console's greys with
	 * the one mint roof the brand mark carries. Decorative, and hidden on a
	 * phone, where the form is the whole screen.
	 */
	const L = { lx: 2.4, ly: 1, lz: 1 };
	const stack: { box: Box; paint: string; lid?: string }[] = [
		{ box: { x: 0, y: 0, z: 0, ...L }, paint: '#2e2e2e' },
		{ box: { x: 0.3, y: 1.15, z: 0, ...L }, paint: '#3a3a3a' },
		{ box: { x: 0.15, y: 0.55, z: 1, ...L }, paint: '#333333' },
		{ box: { x: 0.45, y: 0.6, z: 2, ...L }, paint: '#3a3a3a', lid: '#28e99f' }
	];
	const unit = 40;
	const viewBox = bounds(
		stack.map((c) => c.box),
		unit,
		4
	);
</script>

<svelte:head>
	<title>Sign in · ShipTrack Pro</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="login">
	<div class="login__frame">
		<span class="corner corner--tl" aria-hidden="true"></span>
		<span class="corner corner--br" aria-hidden="true"></span>

		<div class="login__form">
			<div class="login__brand">
				<Mark size={34} tone="dark" />
				<span class="login__word">ShipTrack</span>
			</div>
			<p class="st-label">[ Console ] Licensing</p>
			<h1 class="login__title">Sign in</h1>

			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				class="login__fields"
			>
				<label class="st-field">
					<span class="st-label">Email</span>
					<input
						class="st-input"
						type="email"
						name="email"
						autocomplete="username"
						value={form?.email ?? ''}
						required
					/>
				</label>

				<label class="st-field">
					<span class="st-label">Password</span>
					<input
						class="st-input"
						type="password"
						name="password"
						autocomplete="current-password"
						required
					/>
				</label>

				{#if form?.message}
					<p class="login__error" role="alert">{form.message}</p>
				{/if}

				<button class="st-btn st-btn--accent login__submit" type="submit" disabled={submitting}>
					{submitting ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		</div>

		<div class="login__art" aria-hidden="true">
			<svg {viewBox} class="login__stack">
				{#each stack as { box, paint, lid }, i (i)}
					<Container {box} {unit} {paint} {lid} line="#111111" detail="#4a4a4a" stroke={1.1} />
				{/each}
			</svg>
		</div>
	</div>
</div>

<style>
	.login {
		display: grid;
		place-items: center;
		min-height: 100svh;
		padding: 1.5rem;
		background-image:
			linear-gradient(var(--rule-soft) 1px, transparent 1px),
			linear-gradient(90deg, var(--rule-soft) 1px, transparent 1px);
		background-size: 48px 48px;
		background-position: center;
	}
	.login__frame {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 24rem) minmax(0, 1fr);
		width: min(100%, 50rem);
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.corner {
		position: absolute;
		width: 9px;
		height: 9px;
		background: var(--mint);
	}
	.corner--tl {
		top: -5px;
		left: -5px;
	}
	.corner--br {
		right: -5px;
		bottom: -5px;
	}
	.login__form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 2.25rem 2rem 2.5rem;
	}
	.login__brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.25rem;
	}
	.login__word {
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-size: 19px;
		font-weight: 700;
	}
	.login__title {
		margin: 0 0 0.75rem;
		font-family: var(--st-font-display);
		font-stretch: 118%;
		font-size: 2.3rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
	}
	.login__fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.login__error {
		display: flex;
		gap: 0.5rem;
		margin: 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid color-mix(in oklab, var(--con-crit) 45%, transparent);
		background: color-mix(in oklab, var(--con-crit) 8%, transparent);
		color: var(--con-crit);
		font-size: 14px;
	}
	.login__submit {
		width: 100%;
		margin-top: 0.25rem;
	}
	.login__art {
		display: grid;
		place-items: center;
		padding: 2rem;
		border-left: 1px dashed var(--rule);
		background-image: repeating-linear-gradient(
			135deg,
			var(--rule-soft) 0 1px,
			transparent 1px 8px
		);
	}
	.login__stack {
		width: 100%;
		height: auto;
	}

	@media (max-width: 720px) {
		.login__frame {
			grid-template-columns: 1fr;
			max-width: 26rem;
		}
		.login__art {
			display: none;
		}
	}
</style>
