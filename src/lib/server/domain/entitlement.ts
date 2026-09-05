import { newNonce, signLicenseToken, type LicenseTokenPayload, type SignedToken } from '../crypto/ed25519.ts';
import { optionalNumber } from '../env.ts';
import type { Activation, License } from '../db/schema.ts';
import { effectiveFeatures, effectiveLimits } from './tiers.ts';
import type { LicenseState } from './licenses.ts';

export function tokenTtlSeconds(): number {
	return optionalNumber('TOKEN_TTL_DAYS', 7) * 86_400;
}

/**
 * Builds and signs the entitlement returned by activate and heartbeat.
 *
 * A refused licence is signed too. Returning an unsigned error lets a site with
 * a patched host file simply drop the response and keep its last good token;
 * returning a signed "this is revoked" means the plugin has something
 * authentic to act on, and the short expiry is what bounds how long a captured
 * good token stays useful.
 */
export function buildEntitlement(
	license: License,
	activation: Pick<Activation, 'domain' | 'installId'>,
	state: LicenseState,
	seats: { used: number; total: number },
	nonce?: string
): SignedToken & { expiresAt: number | null } {
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + tokenTtlSeconds();

	const payload: LicenseTokenPayload = {
		v: 1,
		sub: `sha256:${license.keyHash}`,
		domain: activation.domain,
		install: activation.installId,
		tier: license.tier,
		features: state === 'ACTIVE' || state === 'GRACE' ? effectiveFeatures(license) : [],
		status: state,
		seats,
		limits: effectiveLimits(license),
		exp,
		iat,
		// A minute of slack: WordPress hosts drift, and rejecting a token the
		// server minted one second ago is the least useful failure available.
		nbf: iat - 60,
		nonce: nonce ?? newNonce()
	};

	return { ...signLicenseToken(payload), expiresAt: exp };
}
