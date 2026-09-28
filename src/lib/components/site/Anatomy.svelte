<script lang="ts">
	import { withCheck } from '$lib/tracking';

	/*
	 * The quiet beat before the peak: one sentence and the anatomy of a number.
	 * Nothing here moves, on purpose. The segments are split from a number the
	 * port computed, so the check pair shown is the real one.
	 */
	const [country, branch, date, sequence, check] = withCheck('GBR-LDN-20260928-000483').split('-');
	const parts = [
		{ value: country, label: 'Country' },
		{ value: branch, label: 'Branch' },
		{ value: date, label: 'Date' },
		{ value: sequence, label: 'Sequence' },
		{ value: check, label: 'Check', check: true }
	];
</script>

<section class="anatomy" aria-labelledby="anatomy-title">
	<p class="st-label">[ L02 ] Self-checking numbers</p>
	<div class="anatomy__body">
		<h2 id="anatomy-title" class="st-display anatomy__title">Every number carries its own check.</h2>

		<figure class="anatomy__figure">
			<div class="anatomy__parts">
				{#each parts as part, i (part.label)}
					{#if i > 0}<span class="anatomy__dash" aria-hidden="true">-</span>{/if}
					<span class="anatomy__part" class:anatomy__part--check={part.check}>
						<span class="anatomy__value">{part.value}</span>
						<span class="st-label">{part.label}</span>
					</span>
				{/each}
			</div>
			<figcaption class="anatomy__caption">
				The last two characters are computed from everything before them, so the number can tell
				when it has been copied down wrong.
			</figcaption>
		</figure>
	</div>
</section>

<style>
	.anatomy {
		padding: 7rem 1.5rem 8rem;
	}
	.anatomy__body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 3rem;
		align-items: end;
		margin-top: 2.5rem;
	}
	.anatomy__title {
		max-width: 12ch;
		margin: 0;
		font-size: clamp(2.3rem, 4.8vw, 4.2rem);
		font-stretch: 108%;
	}
	.anatomy__figure {
		margin: 0;
	}
	.anatomy__parts {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.2rem 0.35rem;
	}
	.anatomy__part {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.35rem 0.4rem;
		border: 1px dashed transparent;
	}
	.anatomy__part--check {
		border-color: var(--ink);
		background: var(--sheet);
	}
	.anatomy__value,
	.anatomy__dash {
		font-family: var(--st-font-mono);
		font-size: clamp(1.15rem, 2vw, 1.6rem);
		font-weight: 700;
		line-height: 1;
	}
	.anatomy__dash {
		padding-top: 0.35rem;
		color: var(--ink-faint);
	}
	.anatomy__caption {
		max-width: 30rem;
		margin-top: 1.5rem;
		color: var(--ink-soft);
	}

	@media (max-width: 860px) {
		.anatomy {
			padding: 5rem 1.25rem 5.5rem;
		}
		.anatomy__body {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
	}
</style>
