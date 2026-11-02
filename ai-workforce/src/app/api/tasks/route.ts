import { z } from "zod";
import { apiError, readJson, requireSameOrigin, withOrganization } from "@/lib/db";

export const runtime = "nodejs";

const CreateTask = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).default(""),
});

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      return Response.json({ error: "A valid organizationId is required" }, { status: 400 });
    }
    const tasks = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, organization_id AS \"organizationId\", project_id AS \"projectId\", title, description, status, created_at AS \"createdAt\" FROM tasks WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100",
        [organizationId],
      );
      return result.rows;
    });
    return Response.json({ tasks });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = CreateTask.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid task details", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    const task = await withOrganization(input.organizationId, ["owner", "admin", "operator"], async (client, userId) => {
      const result = await client.query(
        "INSERT INTO tasks (organization_id, project_id, title, description, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, organization_id AS \"organizationId\", project_id AS \"projectId\", title, description, status, created_at AS \"createdAt\"",
        [input.organizationId, input.projectId ?? null, input.title, input.description, userId],
      );
      const created = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'task.created', 'task', $3, $4::jsonb)",
        [input.organizationId, userId, created.id, JSON.stringify({ title: input.title, projectId: input.projectId ?? null })],
      );
      return created;
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
