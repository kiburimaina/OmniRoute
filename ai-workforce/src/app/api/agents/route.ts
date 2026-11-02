import { z } from "zod";
import { apiError, readJson, requireSameOrigin, withOrganization } from "@/lib/db";

export const runtime = "nodejs";

const CreateAgent = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  department: z.enum(["development", "sales", "operations"]),
});

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      return Response.json({ error: "A valid organizationId is required" }, { status: 400 });
    }
    const agents = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, organization_id AS \"organizationId\", name, department, enabled, created_at AS \"createdAt\" FROM agents WHERE organization_id = $1 ORDER BY created_at DESC",
        [organizationId],
      );
      return result.rows;
    });
    return Response.json({ agents });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = CreateAgent.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid agent details", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    const agent = await withOrganization(input.organizationId, ["owner", "admin"], async (client, userId) => {
      const result = await client.query(
        "INSERT INTO agents (organization_id, name, department, enabled) VALUES ($1, $2, $3, false) RETURNING id, organization_id AS \"organizationId\", name, department, enabled, created_at AS \"createdAt\"",
        [input.organizationId, input.name, input.department],
      );
      const created = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'agent.created', 'agent', $3, $4::jsonb)",
        [input.organizationId, userId, created.id, JSON.stringify({ name: input.name, department: input.department })],
      );
      return created;
    });
    return Response.json({ agent }, { status: 201 });
  } catch (error) { return apiError(error); }
}
