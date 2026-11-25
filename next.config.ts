import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Native/server-only packages: keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "neo4j-driver"],
  // Pre-baked grounding data and drizzle migrations are read from disk at runtime (Vercel tracing).
  outputFileTracingIncludes: {
    "/**": ["./seed/prebaked/**/*", "./drizzle/**/*"],
  },
  // PGlite (~27 MB) is local-dev only: lib/db requires it lazily when DATABASE_URL is unset and
  // refuses to on Vercel, so keep it out of the deployed functions.
  outputFileTracingExcludes: {
    "/**": ["./node_modules/@electric-sql/pglite/**/*", "./node_modules/.pnpm/@electric-sql+pglite*/**/*"],
  },
};

export default withNextIntl(nextConfig);
