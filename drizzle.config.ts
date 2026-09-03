import { defineConfig } from 'drizzle-kit';

// Migrations run over a direct (non-pooled) connection: drizzle-kit issues DDL
// in a session that the pooler would not keep stable. The runtime uses the
// pooled URL instead — see src/lib/server/db/index.ts.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
	throw new Error('Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL before running drizzle-kit.');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url },
	strict: true,
	verbose: true
});
