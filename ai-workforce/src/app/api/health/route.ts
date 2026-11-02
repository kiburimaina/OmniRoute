export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ai-workforce",
    mode: "foundation",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authenticationConfigured: Boolean(process.env.AUTH_SECRET),
    modelProvidersEnabled: false,
  });
}
