export const runtime = "nodejs";

export async function GET() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const authReady = Boolean(
    process.env.AUTH_DATABASE_URL &&
    secret &&
    new TextEncoder().encode(secret).byteLength >= 32 &&
    process.env.BETTER_AUTH_URL &&
    process.env.APP_ORIGIN,
  );
  const databaseReady = Boolean(process.env.DATABASE_URL);

  return Response.json({
    status: "ok",
    service: "ai-workforce",
    mode: "foundation",
    readiness: {
      businessDatabaseConfigured: databaseReady,
      authenticationConfigured: authReady,
      modelProvidersEnabled: false,
      outboundActionsEnabled: false,
    },
  });
}
