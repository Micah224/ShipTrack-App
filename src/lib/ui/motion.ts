import type { Attachment } from 'svelte/attachments';

/*
 * The two scroll behaviours the landing page uses, as attachments.
 *
 * Both are progressive: without JavaScript, or with reduced motion requested,
 * nothing is hidden and nothing moves. `reveal` only marks an element pending
 * once it knows it can also mark it in; content is never hidden by CSS alone.
 */

export function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Sets `data-reveal="in"` the first time the element enters the viewport. */
export function reveal(threshold = 0.18): Attachment<HTMLElement> {
	return (node) => {
		if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return;

		node.dataset.reveal = 'pending';
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					node.dataset.reveal = 'in';
					io.disconnect();
				}
			},
			{ threshold, rootMargin: '0px 0px -6% 0px' }
		);
		io.observe(node);

		return () => {
			io.disconnect();
			delete node.dataset.reveal;
		};
	};
}

/**
 * Writes scroll progress through the element to `--p`, from 0 as its top
 * crosses `start` (a fraction of the viewport height) to 1 as its bottom
 * crosses `end`. Reduced motion pins it at 1, the finished state.
 */
export function scrollProgress(start = 0.85, end = 0.55): Attachment<HTMLElement> {
	return (node) => {
		if (prefersReducedMotion()) {
			node.style.setProperty('--p', '1');
			return;
		}

		let frame = 0;
		const measure = () => {
			frame = 0;
			const rect = node.getBoundingClientRect();
			const vh = window.innerHeight;
			const travel = vh * start - (vh * end - rect.height);
			const raw = travel > 0 ? (vh * start - rect.top) / travel : 1;
			node.style.setProperty('--p', Math.min(1, Math.max(0, raw)).toFixed(4));
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};

		measure();
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
		};
	};
}
