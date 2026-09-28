<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';

	interface Props {
		value: string;
		placeholder: string;
		/** What is being searched, for the field's accessible name. */
		label: string;
	}

	let { value, placeholder, label }: Props = $props();
</script>

<form method="GET" class="search" role="search">
	<label class="search__field">
		<span class="search__icon"><Icon name="search" size={16} /></span>
		<span class="st-vh">{label}</span>
		<input class="st-input search__input" type="search" name="q" {placeholder} {value} />
	</label>
	<button class="st-btn st-btn--ghost" type="submit">Search</button>
</form>

<style>
	/*
	 * A definite width, capped by the row: a percentage min-width resolves to
	 * nothing while a flex row measures its items, and the row then overflows.
	 */
	.search {
		display: flex;
		gap: 0.4rem;
		width: 22rem;
		max-width: 100%;
	}
	.search__field {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.search__icon {
		position: absolute;
		top: 50%;
		left: 0.7rem;
		display: grid;
		color: var(--ink-faint);
		transform: translateY(-50%);
		pointer-events: none;
	}
	.search__input {
		padding-left: 2.1rem;
	}
</style>
