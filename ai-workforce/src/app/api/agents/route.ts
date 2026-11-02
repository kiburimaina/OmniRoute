import { z } from "zod";
import { apiError, HttpError, readJson, requireSameOrigin, withOrganization } from "@/lib/db";
import { getAgentTemplate } from "@/lib/agent-templates";

export const runtime = "nodejs";

const CreateAgent = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  department: z.enum(["development", "sales", "operations"]).optional(),
  templateId: z.string().min(1).max(80).optional(),
});
const UpdateAgent = z.object({
  organizationId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      return Response.json({ error: "A valid organizationId is required" }, { status: 400 });
    }
    const agents = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, organization_id AS \"organizationId\", name, department, enabled, template_id AS \\"templateId\\", description, responsibilities, created_at AS \"createdAt\" FROM agents WHERE organization_id = $1 ORDER BY created_at DESC",
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
    const template = input.templateId ? getAgentTemplate(input.templateId) : undefined;
    if (input.templateId && !template) return Response.json({ error: "Unknown agent template" }, { status: 400 });
    if (!template && (!input.name || !input.department)) {
      return Response.json({ error: "Name and department are required for a custom agent" }, { status: 400 });
    }
    if (template && input.department && input.department !== template.department) {
      return Response.json({ error: "Template department cannot be changed" }, { status: 400 });
    }
    const agentName = template?.name ?? input.name!;
    const department = template?.department ?? input.department!;
    const policy = template?.policy ?? {
      maxSteps: 8, maxRuntimeSeconds: 60, maxOutputTokens: 0, allowedTools: [],
      requireApprovalFor: ["external_message", "publish", "purchase", "deploy", "repository_merge"],
    };
    const agent = await withOrganization(input.organizationId, ["owner", "admin"], async (client, userId) => {
      const result = await client.query(
        "INSERT INTO agents (organization_id, name, department, enabled, policy, template_id, description, responsibilities) VALUES ($1, $2, $3, false, $4::jsonb, $5, $6, $7::jsonb) RETURNING id, organization_id AS \"organizationId\", name, department, enabled, template_id AS \"templateId\", description, responsibilities, created_at AS \"createdAt\"",
        [input.organizationId, agentName, department, JSON.stringify(policy), template?.id ?? null, template?.description ?? "", JSON.stringify(template?.responsibilities ?? [])],
      );
      const created = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'agent.created', 'agent', $3, $4::jsonb)",
        [input.organizationId, userId, created.id, JSON.stringify({ name: agentName, department, templateId: input.templateId ?? null })],
      );
      return created;
    });
    return Response.json({ agent }, { status: 201 });
  } catch (error) { return apiError(error); }
}

// Enabling an agent only changes registry state. It does not start a worker or
// authorize model/provider execution; those capabilities remain disabled.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) {
      return Response.json({ error: "A valid agent id is required" }, { status: 400 });
    }
    const parsed = UpdateAgent.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid agent update" }, { status: 400 });
    const input = parsed.data;
    const agent = await withOrganization(input.organizationId, ["owner", "admin"], async (client, userId) => {
      const result = await client.query(
        "UPDATE agents SET enabled = $1 WHERE organization_id = $2 AND id = $3 RETURNING id, organization_id AS \"organizationId\", name, department, enabled, template_id AS \\"templateId\\", description, responsibilities, created_at AS \"createdAt\"",
        [input.enabled, input.organizationId, id],
      );
      if (!result.rowCount) throw new HttpError(404, "Agent not found");
      const updated = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', $3, 'agent', $4, $5::jsonb)",
        [input.organizationId, userId, input.enabled ? "agent.enabled" : "agent.disabled", id, JSON.stringify({ enabled: input.enabled })],
      );
      return updated;
    });
    return Response.json({ agent });
  } catch (error) { return apiError(error); }
}
