<script lang="ts">
	let { data } = $props();

	function sizeMb(bytes: number): string {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}
</script>

<svelte:head><title>Releases · ShipTrack Pro</title></svelte:head>

<h1 class="h4 mb-6">Release repository</h1>

{#if data.releases.length === 0}
	<div class="card preset-outlined-surface-200-800 p-6">
		<p class="text-sm opacity-70">
			No releases ingested. Publishing a GitHub release with a
			<code>shiptrack-pro-*.zip</code> asset delivers a webhook that uploads it to R2 and records
			it here.
		</p>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		{#each data.releases as release (release.id)}
			<details class="disclosure card preset-outlined-surface-200-800 p-4">
				<summary class="flex cursor-pointer flex-wrap items-center gap-3">
					<span class="text-lg font-bold">{release.version}</span>
					<span class="badge preset-tonal-primary">{release.tag}</span>
					<span class="text-sm opacity-70">
						{new Date(release.publishedAt).toLocaleDateString()}
					</span>
					<span class="ml-auto text-sm opacity-70">
						{release.downloadCount} download{release.downloadCount === 1 ? '' : 's'}
					</span>
				</summary>

				<div class="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
					<div>
						<h3 class="h6 mb-2">Changelog</h3>
						{#if release.changelogHtml}
							<!--
								Sanitized twice against the allowlist in src/lib/server/sanitize.ts:
								once by the webhook before storage, and again in listReleases() on
								the way out. The second pass is what makes this safe without
								trusting every writer, including rows stored before that sanitizer
								existed. eslint-disable-next-line svelte/no-at-html-tags
							-->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="prose-sm max-w-none text-sm">{@html release.changelogHtml}</div>
						{:else}
							<p class="text-sm opacity-60">No changelog was published for this release.</p>
						{/if}
					</div>

					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt class="opacity-60">Size</dt><dd>{sizeMb(release.fileSize)}</dd>
						<dt class="opacity-60">Requires WP</dt><dd>{release.minWp}</dd>
						<dt class="opacity-60">Requires PHP</dt><dd>{release.minPhp}</dd>
						<dt class="opacity-60">Tested to</dt><dd>{release.testedUpTo}</dd>
						<dt class="opacity-60">R2 key</dt><dd><code class="text-xs">{release.r2StorageKey}</code></dd>
						<dt class="opacity-60">SHA-256</dt>
						<dd><code class="text-xs break-all select-all">{release.fileSha256}</code></dd>
					</dl>
				</div>
			</details>
		{/each}
	</div>
{/if}
