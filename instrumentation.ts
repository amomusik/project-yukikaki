/**
 * Local dev without DATABASE_URL: register the PGlite factory once at server start (see
 * lib/db/register-pglite.ts). The literal NEXT_RUNTIME check lets webpack drop the import from
 * the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerPglite } = await import("./lib/db/register-pglite");
    await registerPglite();
  }
}
