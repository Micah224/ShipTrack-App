<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-surface-50-950 text-surface-950-50">
	{@render children()}
</div>
