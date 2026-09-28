<script lang="ts">
	import { withCheck } from '$lib/tracking';
	import Mark from '$lib/ui/Mark.svelte';

	/*
	 * A sample waybill. The number is computed, not typed: it carries the check
	 * pair the plugin itself would give it, so a visitor who copies it into the
	 * tracking check further down sees it validate.
	 */
	const number = withCheck('GBR-LDN-20260928-000483');
</script>

<div class="tag">
	<span class="tag__eyelet"></span>
	<div class="tag__head">
		<span class="st-label">Waybill · sample</span>
		<Mark size={22} />
	</div>
	<div class="tag__row">
		<span class="st-label">Tracking no.</span>
		<span class="tag__number">{number}</span>
	</div>
	<div class="tag__grid">
		<div>
			<span class="st-label">From</span>
			<span class="tag__value">LDN</span>
		</div>
		<div>
			<span class="st-label">To</span>
			<span class="tag__value">DLA</span>
		</div>
		<div>
			<span class="st-label">Mode</span>
			<span class="tag__value">Sea</span>
		</div>
		<div>
			<span class="st-label">Status</span>
			<span class="tag__value tag__status"><i></i>In transit</span>
		</div>
	</div>
	<div class="tag__barcode"></div>
</div>

<style>
	.tag {
		position: relative;
		width: 100%;
		padding: 16px 18px 14px 34px;
		background: #fbfbf9;
		border: 1.25px solid var(--site-ink);
		color: var(--site-ink);
		/* The clipped left end of a shipping tag. */
		clip-path: polygon(22px 0, 100% 0, 100% 100%, 22px 100%, 0 calc(100% - 22px), 0 22px);
		box-shadow: 0 1px 0 var(--site-ink);
	}
	.tag::before {
		/* clip-path eats the border on the angled edges; redraw them. */
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			linear-gradient(to bottom right, transparent calc(50% - 0.7px), var(--site-ink) calc(50% - 0.7px), var(--site-ink) calc(50% + 0.7px), transparent calc(50% + 0.7px)) top left / 22px 22px no-repeat,
			linear-gradient(to top right, transparent calc(50% - 0.7px), var(--site-ink) calc(50% - 0.7px), var(--site-ink) calc(50% + 0.7px), transparent calc(50% + 0.7px)) bottom left / 22px 22px no-repeat;
	}
	.tag__eyelet {
		position: absolute;
		top: 50%;
		left: 11px;
		width: 11px;
		height: 11px;
		margin-top: -5.5px;
		border: 1.25px solid var(--site-ink);
		border-radius: 50%;
		background: var(--site-canvas);
	}
	.tag__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 10px;
		border-bottom: 1px dashed var(--site-rule);
	}
	.tag__row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 0;
		border-bottom: 1px dashed var(--site-rule);
	}
	.tag__number {
		font-family: var(--st-font-mono);
		font-size: clamp(13px, 1.25vw, 16px);
		font-weight: 700;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}
	.tag__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 16px;
		padding: 10px 0;
	}
	.tag__grid div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tag__value {
		font-size: 14px;
		font-weight: 600;
	}
	.tag__status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.tag__status i {
		width: 8px;
		height: 8px;
		border: 1.25px solid var(--site-ink);
		border-radius: 50%;
		background: var(--mint);
	}
	.tag__barcode {
		height: 26px;
		margin-top: 2px;
		background: repeating-linear-gradient(
			90deg,
			var(--site-ink) 0 2px,
			transparent 2px 4px,
			var(--site-ink) 4px 5px,
			transparent 5px 8px,
			var(--site-ink) 8px 11px,
			transparent 11px 12px,
			var(--site-ink) 12px 13px,
			transparent 13px 16px
		);
		opacity: 0.85;
	}
</style>
