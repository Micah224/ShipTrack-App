/**
 * Server-side configuration.
 *
 * Reads `process.env` rather than `$env/dynamic/private`. On Vercel's Node
 * runtime the two are the same object, and going direct means the mint and
 * keygen CLIs can import the very modules the server uses instead of
 * reimplementing them — a duplicated AES-GCM envelope that drifts would mint
 * licences the server cannot decrypt.
 *
 * The safety `$env/dynamic/private` provides is not lost: everything under
 * `$lib/server/` is server-only by path, so importing this into client code is
 * already a build error.
 */
export function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function optional(name: string, fallback = ''): string {
	return process.env[name] ?? fallback;
}

export function optionalNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}
