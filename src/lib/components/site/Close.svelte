<script lang="ts">
	import { resolve } from '$app/paths';

	/*
	 * Proof of delivery: the manifest resolves. A stamp, one line, the two
	 * things a visitor can do. It holds rather than fading into the footer.
	 */
</script>

<section class="close" aria-labelledby="close-title">
	<div class="close__dock st-hazard" aria-hidden="true"></div>
	<div class="close__body">
		<div class="stamp" aria-hidden="true">
			<span class="stamp__top">Proof of delivery</span>
			<span class="stamp__word">Delivered</span>
			<span class="stamp__bottom">Signed · ShipTrack Pro</span>
		</div>
		<div class="close__copy">
			<h2 id="close-title" class="st-display close__title">Answer the question before they ask it.</h2>
			<div class="close__actions">
				<a href="#pricing" class="st-btn st-btn--tag st-btn--mint">See pricing</a>
				<a href={resolve('/portal')} class="st-btn st-btn--tag st-btn--ink">Open the licence portal</a>
			</div>
		</div>
	</div>
</section>

<style>
	.close {
		background: var(--mint-pale);
	}
	.close__dock {
		height: 12px;
		opacity: 0.9;
	}
	.close__body {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 3.5rem;
		align-items: center;
		padding: 5.5rem 1.5rem 6rem;
	}
	.stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 1rem 1.4rem;
		border: 3px double var(--ink);
		color: var(--ink);
		transform: rotate(-7deg);
		font-family: var(--font-mono);
		text-transform: uppercase;
	}
	.stamp__top,
	.stamp__bottom {
		font-size: 11px;
		letter-spacing: 0.14em;
	}
	.stamp__word {
		padding: 0.2rem 0;
		border-block: 1.5px solid var(--ink);
		font-family: var(--font-display);
		font-stretch: 140%;
		font-size: 2.1rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}
	.close__title {
		max-width: 16ch;
		margin: 0 0 1.8rem;
		font-size: clamp(2.2rem, 4.8vw, 4rem);
		font-stretch: 112%;
	}
	.close__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@media (max-width: 760px) {
		.close__body {
			grid-template-columns: 1fr;
			gap: 2.5rem;
			padding: 4rem 1.25rem 4.5rem;
		}
		.stamp {
			justify-self: start;
		}
	}
</style>
