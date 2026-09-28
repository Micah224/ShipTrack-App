<script lang="ts">
	interface Props {
		/** Whether the number above passed its check, so a lookup would run. */
		active: boolean;
	}

	let { active }: Props = $props();

	/*
	 * The plugin's StatusMachine, main path and side states, with its labels.
	 * Terminal states and the rule that on-hold cannot jump to delivered are
	 * the plugin's, not the page's.
	 */
	const path = ['Pending', 'Confirmed', 'Picked up', 'In transit', 'Out for delivery', 'Delivered'];
	const side = ['On hold', 'Exception', 'Returned', 'Cancelled'];
</script>

<div class="life" data-active={active}>
	<div class="life__head">
		<span class="st-label">After the check · the shipment lifecycle</span>
		<span class="life__note">
			{active
				? 'A valid number goes on to the lookup, which shows where the shipment is in these steps.'
				: 'A number that fails its check never reaches this far.'}
		</span>
	</div>

	{#key active}
		<ol class="life__path">
			{#each path as state, i (state)}
				<li style:--i={i}>
					<span class="life__node" aria-hidden="true"></span>
					<span class="life__state">{state}</span>
				</li>
			{/each}
		</ol>
	{/key}

	<p class="life__side">
		<span class="st-label">Side states</span>
		{#each side as state (state)}<span class="life__pill">{state}</span>{/each}
		<span class="life__rule">On hold returns to transit before delivery. It never skips straight to delivered.</span>
	</p>
</div>

<style>
	.life {
		margin-top: 2.5rem;
		padding: 1.5rem 0 0;
		border-top: 1px dashed var(--rule);
	}
	.life__head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.4rem;
	}
	.life__note {
		color: var(--ink-soft);
		font-size: 0.95rem;
	}
	.life__path {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.life__path li {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding-right: 0.75rem;
	}
	.life__path li:not(:last-child)::after {
		/* The connector to the next state. */
		content: '';
		position: absolute;
		top: 8px;
		left: 18px;
		right: 0;
		height: 2px;
		background: var(--ink);
		opacity: 0.25;
	}
	.life__node {
		width: 18px;
		height: 18px;
		border: 2px solid var(--ink);
		background: var(--sheet);
	}
	.life__state {
		font-weight: 600;
		font-size: 0.95rem;
	}
	.life[data-active='true'] .life__node {
		animation: light 420ms var(--st-ease-out) both;
		animation-delay: calc(var(--i) * 140ms);
	}
	.life[data-active='true'] .life__path li:not(:last-child)::after {
		animation: connect 420ms var(--st-ease-out) both;
		animation-delay: calc(var(--i) * 140ms + 80ms);
	}
	.life[data-active='false'] .life__path {
		opacity: 0.38;
	}
	@keyframes light {
		to {
			background: var(--mint);
		}
	}
	@keyframes connect {
		to {
			opacity: 1;
		}
	}

	.life__side {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.6rem;
		margin: 1.6rem 0 0;
	}
	.life__pill {
		padding: 3px 8px;
		border: 1px solid var(--rule);
		font-size: 0.85rem;
	}
	.life__rule {
		flex-basis: 100%;
		color: var(--ink-soft);
		font-size: 0.9rem;
	}

	@media (max-width: 860px) {
		.life__path {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}
		.life__path li {
			flex-direction: row;
			align-items: center;
		}
		.life__path li:not(:last-child)::after {
			top: 18px;
			left: 8px;
			right: auto;
			width: 2px;
			height: calc(100% - 4px);
		}
	}
</style>
