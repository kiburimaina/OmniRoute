export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ai-workforce",
    mode: "foundation",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authenticationConfigured: Boolean(process.env.BETTER_AUTH_SECRET && new TextEncoder().encode(process.env.BETTER_AUTH_SECRET).byteLength >= 32 && Boolean(process.env.AUTH_DATABASE_URL)),
    modelProvidersEnabled: false,
  });
}
