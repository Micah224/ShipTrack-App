/*
 * Isometric geometry for the shipping-container drawings.
 *
 * One projection serves the brand mark, the hero stack and the footer field,
 * so the three cannot drift into slightly different angles. Coordinates are in
 * container-yard units: x runs along a container's length, y across it, z up.
 */

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

export interface Box {
	x: number;
	y: number;
	z: number;
	/** Length along x, width along y, height along z. */
	lx: number;
	ly: number;
	lz: number;
}

export interface BoxDrawing {
	/** SVG polygon `points` for each visible face. */
	top: string;
	side: string;
	end: string;
	/** Corrugation ribs on the long side, as [x1, y1, x2, y2] segments. */
	ribs: [number, number, number, number][];
	/** Locking bars on the door end. */
	bars: [number, number, number, number][];
}

/** Yard coordinates to screen coordinates, in the one isometric projection. */
export function project(x: number, y: number, z: number, unit: number): [number, number] {
	return [(x - y) * COS * unit, (x + y) * SIN * unit - z * unit];
}

/** A projected face as an SVG `points` string. */
function poly(points: [number, number, number][], unit: number): string {
	return points
		.map(([x, y, z]) =>
			project(x, y, z, unit)
				.map((n) => n.toFixed(2))
				.join(',')
		)
		.join(' ');
}

/** A projected line segment, as the x1, y1, x2, y2 an SVG line takes. */
function segment(
	a: [number, number, number],
	b: [number, number, number],
	unit: number
): [number, number, number, number] {
	const [x1, y1] = project(...a, unit);
	const [x2, y2] = project(...b, unit);
	return [x1, y1, x2, y2];
}

/**
 * The three faces a viewer above and in front of the yard can see, plus the
 * detail lines that make a box read as a container rather than a cube.
 */
export function drawBox(box: Box, unit: number, ribCount = 9): BoxDrawing {
	const { x, y, z, lx, ly, lz } = box;
	const x2 = x + lx;
	const y2 = y + ly;
	const z2 = z + lz;
	const inset = lz * 0.1;

	const ribs: BoxDrawing['ribs'] = [];
	for (let i = 1; i <= ribCount; i++) {
		const rx = x + (lx * i) / (ribCount + 1);
		ribs.push(segment([rx, y2, z + inset], [rx, y2, z2 - inset], unit));
	}

	const bars: BoxDrawing['bars'] = [0.3, 0.7].map((t) =>
		segment([x2, y + ly * t, z + inset], [x2, y + ly * t, z2 - inset], unit)
	);

	return {
		top: poly(
			[
				[x, y, z2],
				[x2, y, z2],
				[x2, y2, z2],
				[x, y2, z2]
			],
			unit
		),
		side: poly(
			[
				[x, y2, z],
				[x2, y2, z],
				[x2, y2, z2],
				[x, y2, z2]
			],
			unit
		),
		end: poly(
			[
				[x2, y, z],
				[x2, y2, z],
				[x2, y2, z2],
				[x2, y, z2]
			],
			unit
		),
		ribs,
		bars
	};
}

/** The screen-space bounding box of a set of boxes, for an SVG viewBox. */
export function bounds(boxes: Box[], unit: number, pad = 2): string {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const { x, y, z, lx, ly, lz } of boxes) {
		for (const cx of [x, x + lx])
			for (const cy of [y, y + ly])
				for (const cz of [z, z + lz]) {
					const [sx, sy] = project(cx, cy, cz, unit);
					minX = Math.min(minX, sx);
					minY = Math.min(minY, sy);
					maxX = Math.max(maxX, sx);
					maxY = Math.max(maxY, sy);
				}
	}
	return `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + pad * 2).toFixed(1)} ${(maxY - minY + pad * 2).toFixed(1)}`;
}
