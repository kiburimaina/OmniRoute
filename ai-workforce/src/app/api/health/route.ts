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
  const workerAuthReady = Boolean(process.env.WORKER_SHARED_SECRET && new TextEncoder().encode(process.env.WORKER_SHARED_SECRET).byteLength >= 32 && process.env.WORKER_ALLOWED_ORGANIZATIONS?.split(",").some((id) => /^[0-9a-f-]{36}$/i.test(id.trim())));

  return Response.json({
    status: "ok",
    service: "ai-workforce",
    mode: "foundation",
    readiness: {
      businessDatabaseConfigured: databaseReady,
      authenticationConfigured: authReady,
      internalWorkerAuthenticationConfigured: workerAuthReady,
      modelProvidersEnabled: false,
      outboundActionsEnabled: false,
    },
  });
}
