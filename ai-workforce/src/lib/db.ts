import "server-only";
import { Pool, type PoolClient } from "pg";
import { getSessionUserId } from "./auth";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Database is not configured");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  return pool;
}

export type OrganizationRole = "owner" | "admin" | "operator" | "viewer";
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const MAX_JSON_BYTES = 64 * 1024;

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) throw new HttpError(403, "Cross-origin request rejected");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new HttpError(403, "Cross-site request rejected");
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "Content-Type must be application/json");
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_JSON_BYTES) throw new HttpError(413, "Request body is too large");
  if (!request.body) throw new HttpError(400, "Request body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "Request body is too large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, "Request body must contain valid JSON"); }
}

export async function withUserTransaction<T>(work: (client: PoolClient, userId: string) => Promise<T>): Promise<T> {
  const userId = await getSessionUserId();
  if (!userId) throw new HttpError(401, "Authentication required");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client, userId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function withOrganization<T>(
  organizationId: string,
  allowedRoles: OrganizationRole[],
  work: (client: PoolClient, userId: string) => Promise<T>,
): Promise<T> {
  return withUserTransaction(async (client, userId) => {
    const membership = await client.query<{ role: OrganizationRole }>(
      "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, userId],
    );
    const role = membership.rows[0]?.role;
    if (!role) throw new HttpError(404, "Organization not found");
    if (!allowedRoles.includes(role)) throw new HttpError(403, "Insufficient organization permissions");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
    return work(client, userId);
  });
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
