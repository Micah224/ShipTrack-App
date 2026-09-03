import crypto from 'node:crypto';

/**
 * Constant-time string comparison that tolerates a length mismatch.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length rather than
 * returning false, so every caller has to remember to check first. Hashing both
 * sides to a fixed width removes the trap: the comparison is always over 32
 * bytes, whatever was presented.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
	const ha = crypto.createHash('sha256').update(a).digest();
	const hb = crypto.createHash('sha256').update(b).digest();
	return crypto.timingSafeEqual(ha, hb);
}
