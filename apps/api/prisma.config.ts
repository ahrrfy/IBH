import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 (I040) — datasource.url comes from this config file, not from
// schema.prisma. We always supply a url so CLI commands like
// `prisma migrate deploy/resolve/status` work — they error with a cryptic
// "datasource.url property is required" if datasource is undefined.
//
// `prisma generate` runs at Docker build time when DATABASE_URL is not set,
// so we fall back to a placeholder URL that Prisma never actually opens (the
// generator doesn't read from the database; it only reads schema.prisma).
// Migration commands DO need a real URL — Docker Compose passes DATABASE_URL
// through the api service env, so it's always present at runtime.
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: { url: databaseUrl },
  // Prisma 7 dropped the package.json `prisma.seed` configuration in
  // favour of the config file (`migrations.seed`). Without this, every
  // `prisma db seed` invocation logs "⚠️ No seed command configured"
  // and exits 0 — the DB stays empty and downstream e2e tests fail
  // with `prisma.company.findFirst({ where: { code: 'RUA' } })` → null.
  migrations: {
    seed: 'tsx prisma/seed-bootstrap.ts',
  },
});
