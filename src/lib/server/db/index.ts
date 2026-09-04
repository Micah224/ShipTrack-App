import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { required } from '../env.ts';
import * as schema from './schema.ts';

/*
 * neon-http over the pooled connection string.
 *
 * Each query is a stateless HTTPS request, so there is no pool to exhaust and
 * no socket to survive a frozen Vercel function — the failure mode that makes
 * a conventional pg Pool painful on serverless. The cost is that transactions
 * spanning several statements are unavailable here; the one place that matters
 * (minting a licence) runs on Node against the direct URL instead.
 */
let cached: ReturnType<typeof create> | undefined;

function create() {
	return drizzle(neon(required('DATABASE_URL')), { schema });
}

export function getDb() {
	cached ??= create();
	return cached;
}

export { schema };
