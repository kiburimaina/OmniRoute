import "server-only";
import { Pool, type PoolClient } from "pg";
import { getSessionUserId } from "./auth";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new HttpError(503, "Database is not configured");
  }
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
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** Parse JSON consistently so malformed bodies are client errors, not 500s. */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON");
  }
}

export async function withOrganization<T>(
  organizationId: string,
  allowedRoles: OrganizationRole[],
  work: (client: PoolClient, userId: string) => Promise<T>,
): Promise<T> {
  const userId = await getSessionUserId();
  if (!userId) throw new HttpError(401, "Authentication required");

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const membership = await client.query<{ role: OrganizationRole }>(
      "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, userId],
    );
    const role = membership.rows[0]?.role;
    if (!role) throw new HttpError(404, "Organization not found");
    if (!allowedRoles.includes(role)) throw new HttpError(403, "Insufficient organization permissions");

    // Membership is verified before setting the transaction-local RLS context.
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
    const result = await work(client, userId);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
