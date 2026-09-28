<script lang="ts">
	import PageHead from '$lib/components/console/PageHead.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	let { data } = $props();

	function sizeMb(bytes: number): string {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	function published(value: Date | string): string {
		return new Date(value).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Releases · ShipTrack Pro</title></svelte:head>

<PageHead
	code="C04"
	title="Release repository"
	lede="Plugin builds ingested from GitHub releases, most recently published first. The one marked Latest is the highest version, which is what the WordPress updater offers."
/>

{#if data.releases.length === 0}
	<div class="st-panel empty">
		<Icon name="releases" size={28} />
		<p>
			No releases ingested. Publishing a GitHub release with a
			<code class="st-code">shiptrack-pro-*.zip</code> asset delivers a webhook that uploads it to R2
			and records it here.
		</p>
	</div>
{:else}
	<ol class="releases">
		{#each data.releases as release (release.id)}
			<li>
				<details class="release" open={release.id === data.latestId}>
					<summary class="release__summary">
						<span class="release__chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
						<span class="release__version">{release.version}</span>
						{#if release.id === data.latestId}<span class="st-chip" data-tone="accent">Latest</span>{/if}
						<span class="st-chip" data-raw>{release.tag}</span>
						<span class="release__date">{published(release.publishedAt)}</span>
						<span class="release__downloads">
							<span class="st-num">{release.downloadCount}</span>
							download{release.downloadCount === 1 ? '' : 's'}
						</span>
					</summary>

					<div class="release__body">
						<div class="release__log">
							<h3 class="st-label">Changelog</h3>
							{#if release.changelogHtml}
								<!--
									Sanitized twice against the allowlist in src/lib/server/sanitize.ts:
									once by the webhook before storage, and again in listReleases() on
									the way out. The second pass is what makes this safe without
									trusting every writer, including rows stored before that sanitizer
									existed.
								-->
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<div class="prose">{@html release.changelogHtml}</div>
							{:else}
								<p class="st-muted">No changelog was published for this release.</p>
							{/if}
						</div>

						<dl class="release__meta">
							<dt>Size</dt>
							<dd>{sizeMb(release.fileSize)}</dd>
							<dt>Requires WP</dt>
							<dd>{release.minWp}</dd>
							<dt>Requires PHP</dt>
							<dd>{release.minPhp}</dd>
							<dt>Tested to</dt>
							<dd>{release.testedUpTo}</dd>
							<dt>R2 key</dt>
							<dd><code class="st-code">{release.r2StorageKey}</code></dd>
							<dt>SHA-256</dt>
							<dd><code class="st-code sha">{release.fileSha256}</code></dd>
						</dl>
					</div>
				</details>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.empty {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.5rem;
		color: var(--ink-soft);
	}
	.empty p {
		max-width: 44rem;
		margin: 0;
	}

	.releases {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.release {
		border: 1px solid var(--rule);
		background: var(--sheet);
	}
	.release__summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 0.9rem;
		padding: 1rem 1.25rem;
		cursor: pointer;
		list-style: none;
	}
	.release__summary::-webkit-details-marker {
		display: none;
	}
	.release__summary:hover {
		background: var(--sheet-2);
	}
	.release__chevron {
		display: grid;
		color: var(--ink-faint);
		transform: rotate(-90deg);
		transition: transform 160ms var(--st-ease-out);
	}
	.release[open] .release__chevron {
		transform: none;
	}
	.release__version {
		font-family: var(--st-font-mono);
		font-size: 1.2rem;
		font-weight: 700;
	}
	.release__date {
		color: var(--ink-soft);
		font-size: 14px;
	}
	.release__downloads {
		margin-left: auto;
		color: var(--ink-soft);
		font-size: 14px;
	}
	.release__body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 24rem);
		gap: 1.5rem 2rem;
		padding: 1.25rem;
		border-top: 1px dashed var(--rule);
	}
	.release__log h3 {
		margin: 0 0 0.75rem;
	}
	.prose {
		color: var(--ink-soft);
		font-size: 14px;
	}
	.prose :global(:is(h1, h2, h3, h4)) {
		margin: 1rem 0 0.4rem;
		color: var(--ink);
		font-size: 14px;
		font-weight: 600;
	}
	/* Tailwind's reset strips list markers; a changelog needs them back. */
	.prose :global(ul) {
		margin: 0.25rem 0 0.75rem;
		padding-left: 1.2rem;
		list-style: square;
	}
	.prose :global(ol) {
		margin: 0.25rem 0 0.75rem;
		padding-left: 1.4rem;
		list-style: decimal;
	}
	.prose :global(li::marker) {
		color: var(--ink-faint);
	}
	.prose :global(li) {
		margin: 0.2rem 0;
	}
	.prose :global(p) {
		margin: 0 0 0.6rem;
	}
	.prose :global(a) {
		color: var(--ink);
		text-underline-offset: 3px;
	}
	.prose :global(code) {
		font-family: var(--st-font-mono);
		font-size: 0.92em;
	}
	.release__meta {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-content: start;
		gap: 0.5rem 1rem;
		margin: 0;
		padding: 1rem;
		border: 1px solid var(--rule-soft);
		background: var(--bg);
		font-size: 13px;
	}
	.release__meta dt {
		color: var(--ink-faint);
		font: 400 11px/1.6 var(--st-font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.release__meta dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sha {
		user-select: all;
	}

	@media (max-width: 860px) {
		.release__body {
			grid-template-columns: 1fr;
		}
		.release__downloads {
			margin-left: 0;
			width: 100%;
		}
	}
</style>
