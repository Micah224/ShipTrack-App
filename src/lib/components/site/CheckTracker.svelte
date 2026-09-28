<script lang="ts">
	import { verify, withCheck } from '$lib/tracking';
	import Lifecycle from './Lifecycle.svelte';

	/*
	 * The signature move. A real input, rendered as a manifest field, running
	 * the plugin's own check-pair algorithm on every keystroke (see
	 * $lib/tracking, which is tested against the PHP class). Nothing here is
	 * simulated: a number this field accepts is one the plugin's public lookup
	 * would pass to the database, and a number it rejects is one the lookup
	 * would refuse before any query.
	 */
	const EXAMPLE = withCheck('GBR-LDN-20260928-000483');
	const LABELS = ['Country', 'Branch', 'Date', 'Sequence', 'Check'];

	let value = $state(EXAMPLE);
	const verdict = $derived(verify(value));

	/*
	 * Label slots over the input, in character cells. Only drawn when the
	 * number has five segments; otherwise they would point at the wrong text.
	 */
	const slots = $derived.by(() => {
		const parts = value.trim().toUpperCase().split('-');
		if (parts.length !== 5 || parts.some((part) => part.length === 0)) return [];
		const lead = value.length - value.trimStart().length;
		let at = lead;
		return parts.map((part, i) => {
			const slot = { label: LABELS[i], at, len: part.length, check: i === 4 };
			at += part.length + 1;
			return slot;
		});
	});

	function parts(): string[] {
		const current = value.trim().toUpperCase();
		return (verify(current).state === 'malformed' ? EXAMPLE : current).split('-');
	}

	/** Swap two neighbouring digits: the error people make most when copying. */
	function swap() {
		const p = parts();
		for (const index of [3, 2]) {
			const digits = p[index].split('');
			for (let i = digits.length - 1; i > 0; i--) {
				if (digits[i] !== digits[i - 1]) {
					[digits[i - 1], digits[i]] = [digits[i], digits[i - 1]];
					p[index] = digits.join('');
					value = p.join('-');
					return;
				}
			}
		}
	}

	/** Change one digit of the sequence and leave the check pair alone. */
	function nudge() {
		const p = parts();
		const seq = p[3];
		const last = (Number(seq.at(-1)) + 1) % 10;
		p[3] = seq.slice(0, -1) + String(last);
		value = p.join('-');
	}

	/** Recompute the pair for whatever payload is there now. */
	function repair() {
		if (verdict.state === 'mismatch') value = withCheck(verdict.payload);
	}

	function restore() {
		value = EXAMPLE;
	}
</script>

<section id="check" class="check" aria-labelledby="check-title">
	<div class="check__head">
		<p class="st-label">[ L03 ] Try it</p>
		<h2 id="check-title" class="st-display check__title">Change one character. Watch it get caught.</h2>
	</div>

	<div class="instrument">
		<span class="corner corner--tl" aria-hidden="true"></span>
		<span class="corner corner--tr" aria-hidden="true"></span>
		<span class="corner corner--bl" aria-hidden="true"></span>
		<span class="corner corner--br" aria-hidden="true"></span>

		<label for="tracking-number" class="st-label instrument__label">Tracking number</label>

		<div class="field" data-state={verdict.state}>
			<div class="field__slots" aria-hidden="true">
				{#each slots as slot (slot.label)}
					<div class="field__slot" class:field__slot--check={slot.check} style:left="{slot.at}ch" style:width="{slot.len}ch">
						<span class="field__slot-label">{slot.label}</span>
					</div>
				{/each}
			</div>
			<input
				id="tracking-number"
				class="field__input"
				bind:value
				spellcheck="false"
				autocomplete="off"
				autocapitalize="characters"
				maxlength="40"
				aria-describedby="check-verdict check-shape"
			/>
		</div>

		<div class="verdict" id="check-verdict" role="status" aria-live="polite" data-state={verdict.state}>
			{#if verdict.state === 'valid'}
				<span class="verdict__chip"><b aria-hidden="true">✓</b> Check pair {verdict.check} matches</span>
				<p>
					Well formed and self-consistent. This is the only kind of number the plugin's public lookup
					will take to the database.
				</p>
			{:else if verdict.state === 'mismatch'}
				<span class="verdict__chip">
					<b aria-hidden="true">▲</b> Expected {verdict.expected}, got {verdict.typed}
				</span>
				<p>
					Rejected on the spot. The last two characters do not fit the rest, so the lookup stops
					here and never asks the database for a shipment that cannot exist.
				</p>
			{:else}
				<span class="verdict__chip"><b aria-hidden="true">✕</b> Not a ShipTrack number</span>
				<p>
					It does not have the shape of one, so it is refused without computing anything.
				</p>
			{/if}
		</div>

		<p id="check-shape" class="st-label instrument__shape">
			Shape · Country-Branch-YYYYMMDD-NNNNNN-CC
		</p>

		<div class="instrument__actions">
			<button type="button" class="st-btn st-btn--tag st-btn--ink st-btn--sm" onclick={swap}>
				Swap two digits
			</button>
			<button type="button" class="st-btn st-btn--tag st-btn--ink st-btn--sm" onclick={nudge}>
				Change one digit
			</button>
			{#if verdict.state === 'mismatch'}
				<button type="button" class="st-btn st-btn--tag st-btn--mint st-btn--sm" onclick={repair}>
					Recompute the pair
				</button>
			{/if}
			<button type="button" class="st-btn st-btn--sm instrument__reset" onclick={restore}>
				Restore the example
			</button>
		</div>
	</div>

	<Lifecycle active={verdict.state === 'valid'} />

	<dl class="notes">
		<div>
			<dt class="st-label">How</dt>
			<dd>A Luhn mod-36 check pair, computed over the country, branch, date and sequence.</dd>
		</div>
		<div>
			<dt class="st-label">What it catches</dt>
			<dd>
				Every change to a single character, and almost every swap of two neighbours, the mistakes
				people make copying a number off a label.
			</dd>
		</div>
		<div>
			<dt class="st-label">Why it matters</dt>
			<dd>
				The public tracking page checks the pair first, so a typo is answered at once and never
				costs a database query.
			</dd>
		</div>
	</dl>
</section>

<style>
	.check {
		padding: 6rem 1.5rem 6.5rem;
		background: var(--lime-pale);
	}
	.check__head {
		margin-bottom: 2.5rem;
	}
	.check__title {
		max-width: 15ch;
		margin: 1rem 0 0;
		font-size: clamp(2.4rem, 5.2vw, 4.6rem);
		font-stretch: 112%;
	}

	.instrument {
		position: relative;
		display: grid;
		gap: 1.1rem;
		padding: clamp(1.25rem, 3.5vw, 2.75rem);
		background: #fbfbf9;
		border: 2px solid var(--ink);
	}
	.corner {
		position: absolute;
		width: 10px;
		height: 10px;
		background: var(--ink);
	}
	.corner--tl {
		top: -6px;
		left: -6px;
	}
	.corner--tr {
		top: -6px;
		right: -6px;
	}
	.corner--bl {
		bottom: -6px;
		left: -6px;
	}
	.corner--br {
		bottom: -6px;
		right: -6px;
	}
	.instrument__label {
		color: var(--ink);
	}

	/*
	 * The field: one input on a character grid. Space Mono advances every
	 * glyph by the same width, so `ch` positions the segment labels and the
	 * check highlight exactly over the characters they describe. The type size
	 * is chosen from the container width so all 26 characters fit on a phone.
	 */
	.field {
		container-type: inline-size;
		position: relative;
		padding-top: 1.6rem;
		border-bottom: 2px solid var(--ink);
	}
	.field__input,
	.field__slots {
		font-family: var(--font-mono);
		font-size: min(68px, calc(100cqi / 16.8));
		font-weight: 700;
		letter-spacing: 0;
	}
	.field__input {
		position: relative;
		z-index: 1;
		display: block;
		width: 100%;
		margin: 0;
		padding: 0.1em 0 0.18em;
		border: 0;
		background: transparent;
		color: var(--ink);
		text-transform: uppercase;
		caret-color: var(--ink);
	}
	.field__input:focus {
		outline: none;
	}
	.field:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 8px;
	}
	.field__slots {
		position: absolute;
		inset: 1.6rem 0 0;
		pointer-events: none;
	}
	.field__slot {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.field__slot::after {
		/* A hairline under each segment, gapped from its neighbours. */
		content: '';
		position: absolute;
		left: 0.08em;
		right: 0.08em;
		bottom: 0.08em;
		height: 2px;
		background: var(--ink-faint);
		opacity: 0.35;
	}
	.field__slot-label {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: 0.35rem;
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--ink-soft);
	}
	.field__slot--check {
		background: var(--mark-bg, transparent);
		transition: background-color 180ms var(--ease-out);
	}
	.field[data-state='valid'] .field__slot--check {
		--mark-bg: var(--mint);
	}
	.field[data-state='mismatch'] .field__slot--check {
		--mark-bg: var(--amber);
		animation: knock 320ms var(--ease-out);
	}
	@keyframes knock {
		30% {
			transform: translateX(-3px);
		}
		60% {
			transform: translateX(3px);
		}
	}

	.verdict {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		min-height: 3.2rem;
	}
	.verdict p {
		flex: 1 1 22rem;
		margin: 0;
		color: var(--ink-soft);
	}
	.verdict__chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 6px 10px;
		border: 1.5px solid var(--ink);
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink);
		background: var(--sheet);
	}
	.verdict[data-state='valid'] .verdict__chip {
		background: var(--mint);
		color: var(--mint-ink);
	}
	.verdict[data-state='mismatch'] .verdict__chip {
		background: var(--amber);
		color: #231400;
	}
	.instrument__shape {
		margin: 0;
	}
	.instrument__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.instrument__reset {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.notes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2rem;
		margin: 3rem 0 0;
	}
	.notes div {
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}
	.notes dd {
		margin: 0.5rem 0 0;
		color: var(--ink-soft);
	}

	@media (max-width: 860px) {
		.check {
			padding: 4.5rem 1.25rem 5rem;
		}
		.notes {
			grid-template-columns: 1fr;
			gap: 1.25rem;
		}
		/* At phone widths the labels would overlap; the check label is the one that matters. */
		.field__slot:not(.field__slot--check) .field__slot-label {
			display: none;
		}
	}
</style>
