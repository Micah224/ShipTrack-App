<script lang="ts">
	/*
	 * A horizontal bar list, drawn in HTML so every value is real text.
	 *
	 * Emphasis form: at most one row carries the accent and every other row is
	 * the same recessive grey, so the chart says one thing. Bars are 12px with
	 * a 4px rounded data end, anchored on a single shared baseline, and the
	 * value sits at the tip rather than in a legend. Labels are in text ink,
	 * never in the bar colour.
	 */
	interface Row {
		key: string;
		label: string;
		value: number;
		/** The one row the chart is about. */
		emphasis?: boolean;
		/** A short word after the label, e.g. "current". */
		tag?: string;
	}

	interface Props {
		rows: Row[];
		/** Denominator for the percentage; defaults to the sum of the rows. */
		total?: number;
		/** Singular and plural unit for the value at the tip. */
		unit: [string, string];
		/** Accessible name for the list. */
		label: string;
	}

	let { rows, total, unit, label }: Props = $props();

	const sum = $derived(total ?? rows.reduce((acc, row) => acc + row.value, 0));
	// Scale to the largest row, not to the total, so the longest bar fills the
	// track and small differences stay visible.
	const max = $derived(Math.max(1, ...rows.map((row) => row.value)));

	function pct(value: number): number {
		return sum > 0 ? Math.round((value / sum) * 100) : 0;
	}
</script>

<ul class="bars" aria-label={label}>
	{#each rows as row (row.key)}
		<li class="bar" class:bar--em={row.emphasis}>
			<span class="bar__label">
				<span class="st-code">{row.label}</span>
				{#if row.tag}<span class="bar__tag">{row.tag}</span>{/if}
			</span>
			<span class="bar__track">
				<span class="bar__fill" style:--f={row.value / max} aria-hidden="true"></span>
				<span class="bar__value">
					{row.value}
					{row.value === 1 ? unit[0] : unit[1]}
					<span class="bar__pct">· {pct(row.value)}%</span>
				</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.bars {
		display: grid;
		grid-template-columns: minmax(5.5rem, max-content) minmax(0, 1fr);
		align-items: center;
		gap: 0.9rem 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.bar {
		display: contents;
	}
	.bar__label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink);
		white-space: nowrap;
	}
	.bar__tag {
		color: var(--con-good);
		font: 400 10px/1 var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/*
	 * The value rides at the bar's tip. The fill scales within the track less
	 * the room the longest label needs, so the largest bar's value still fits.
	 */
	.bar__track {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		border-left: 1px solid var(--con-dim);
	}
	.bar__fill {
		flex: none;
		width: calc((100% - 9.5rem) * var(--f));
		height: 12px;
		min-width: 3px;
		border-radius: 0 4px 4px 0;
		background: var(--con-dim);
		transition: background-color 140ms var(--ease-out);
	}
	.bar--em .bar__fill {
		background: var(--con-good);
	}
	.bar:hover .bar__fill {
		background: var(--ink-soft);
	}
	.bar--em:hover .bar__fill {
		background: #52f0b2;
	}
	.bar__value {
		color: var(--ink);
		font-size: 14px;
		white-space: nowrap;
	}
	.bar__pct {
		color: var(--ink-faint);
	}

	/* On a phone each label sits over its bar, so the bar gets the full width. */
	@media (max-width: 520px) {
		.bars {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.35rem;
		}
		.bar__track {
			margin-bottom: 0.7rem;
		}
	}
</style>
