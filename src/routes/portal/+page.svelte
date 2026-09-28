<script lang="ts">
	import Container from '$lib/ui/Container.svelte';
	import { bounds, type Box } from '$lib/ui/iso';

	let { data, form } = $props();
	let busy = $state(false);

	/*
	 * A small stack beside the form, in the landing page's paints, with the
	 * mint roof the brand mark carries. Decorative, and dropped on a phone,
	 * where the form is the whole screen.
	 */
	const L = { lx: 2.4, ly: 1, lz: 1 };
	const stack: { box: Box; paint: string; lid?: string; detail?: string }[] = [
		{ box: { x: 0, y: 0, z: 0, ...L }, paint: '#d6e8ff' },
		{ box: { x: 0.3, y: 1.15, z: 0, ...L }, paint: '#0b3b5c', detail: '#d6e8ff' },
		{ box: { x: 0.15, y: 0.55, z: 1, ...L }, paint: '#f7f7f5' },
		{ box: { x: 0.45, y: 0.6, z: 2, ...L }, paint: '#f7f7f5', lid: '#28e99f' }
	];
	const unit = 40;
	const viewBox = bounds(
		stack.map((c) => c.box),
		unit,
		4
	);
</script>

<svelte:head>
	<title>Sign in · Licence portal · ShipTrack Pro</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="signin" aria-labelledby="signin-title">
	<div class="frame">
		<span class="corner corner--tl" aria-hidden="true"></span>
		<span class="corner corner--br" aria-hidden="true"></span>

		<div class="frame__form">
			<p class="st-label">[ Licence portal ] Sign in</p>
			<h1 id="signin-title" class="st-display frame__title">Manage your licence</h1>
			<p class="frame__lede">
				Sign in with your licence key, the same one your WordPress site uses. See which sites hold a
				seat, free one you have retired, and check what your licence includes.
			</p>

			<form method="POST" class="fields" onsubmit={() => (busy = true)}>
				{#if data.next}<input type="hidden" name="next" value={data.next} />{/if}

				<label class="st-field">
					<span class="st-label">Licence key</span>
					<input
						class="st-input fields__key"
						name="key"
						type="text"
						autocomplete="off"
						spellcheck="false"
						placeholder="STP-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
						required
					/>
				</label>

				{#if form?.message}
					<p class="fields__error" role="alert">{form.message}</p>
				{/if}

				<button class="st-btn st-btn--tag st-btn--ink fields__submit" type="submit" disabled={busy}>
					{busy ? 'Checking…' : 'Sign in'}
				</button>
			</form>

			<!--
				Keys are stored encrypted as well as hashed, and an audited reveal
				returns the same key, so a lost key is found, not replaced: a new key
				would orphan every site activated with the old one.
			-->
			<div class="lost">
				<p class="lost__q">Lost your key?</p>
				<p class="lost__a">
					{#if data.supportEmail}
						Email <a href="mailto:{data.supportEmail}">{data.supportEmail}</a>.
					{:else}
						Ask whoever sold you the licence.
					{/if}
					Keys are stored encrypted, so the same key can be looked up and sent to you again, and every
					site already activated with it keeps working.
				</p>
			</div>
		</div>

		<div class="frame__art" aria-hidden="true">
			<svg {viewBox} class="frame__stack">
				{#each stack as { box, paint, lid, detail }, i (i)}
					<Container
						{box}
						{unit}
						{paint}
						{lid}
						line="#0e2a3f"
						detail={detail ?? '#0e2a3f'}
						stroke={1.2}
					/>
				{/each}
			</svg>
		</div>
	</div>
</section>

<style>
	.signin {
		display: grid;
		place-items: center;
		min-height: calc(100svh - 60px - 12rem);
		padding: 1rem 0;
	}
	.frame {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 28rem) minmax(0, 1fr);
		width: min(100%, 56rem);
		border: 1px solid var(--ink);
		background: var(--sheet);
	}
	/* Registration marks at two corners, as on every ruled sheet of the site. */
	.corner {
		position: absolute;
		width: 9px;
		height: 9px;
		background: var(--ink);
	}
	.corner--tl {
		top: -5px;
		left: -5px;
	}
	.corner--br {
		right: -5px;
		bottom: -5px;
	}

	.frame__form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 2.25rem 2rem 2rem;
	}
	.frame__title {
		margin: 0;
		font-size: clamp(2rem, 4vw, 2.7rem);
		font-stretch: 112%;
	}
	.frame__lede {
		margin: 0 0 0.5rem;
		color: var(--ink-soft);
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.fields__key {
		font-family: var(--st-font-mono);
		font-size: 13px;
		letter-spacing: 0.02em;
	}
	.fields__error {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--st-crit-line);
		border-left-width: 4px;
		background: var(--st-crit-bg);
		color: var(--st-crit-ink);
		font-size: 14px;
	}
	.fields__submit {
		align-self: flex-start;
		min-width: 10rem;
	}

	.lost {
		margin-top: 0.75rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--rule);
	}
	.lost p {
		margin: 0;
	}
	.lost__q {
		font-weight: 600;
	}
	.lost__a {
		color: var(--ink-soft);
		font-size: 14px;
	}
	.lost__a a {
		color: var(--ink);
		text-underline-offset: 3px;
	}

	.frame__art {
		display: grid;
		place-items: center;
		padding: 2rem;
		border-left: 1px dashed var(--rule);
		background-image: repeating-linear-gradient(135deg, var(--hatch) 0 1px, transparent 1px 7px);
	}
	.frame__stack {
		width: min(100%, 20rem);
		height: auto;
	}

	@media (max-width: 760px) {
		.frame {
			grid-template-columns: 1fr;
		}
		.frame__art {
			display: none;
		}
		.frame__form {
			padding: 1.75rem 1.25rem 1.5rem;
		}
		.fields__submit {
			align-self: stretch;
		}
	}
</style>
