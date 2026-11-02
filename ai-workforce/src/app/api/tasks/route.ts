import { z } from "zod";
import { apiError, HttpError, readJson, requireSameOrigin, withOrganization } from "@/lib/db";
import { getWorkflow } from "@/lib/department-workflows";

export const runtime = "nodejs";

const CreateTask = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  assignedAgentId: z.string().uuid().nullable().optional(),
  workflowId: z.string().min(1).max(80).nullable().optional(),
  workflowInput: z.record(z.string(), z.unknown()).default({}),
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
        "SELECT t.id, t.organization_id AS \"organizationId\", t.project_id AS \"projectId\", t.assigned_agent_id AS \"assignedAgentId\", a.name AS \"agentName\", t.title, t.description, t.status, t.created_at AS \"createdAt\" FROM tasks t LEFT JOIN agents a ON a.organization_id = t.organization_id AND a.id = t.assigned_agent_id WHERE t.organization_id = $1 ORDER BY t.created_at DESC LIMIT 100",
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
      const workflow = input.workflowId ? getWorkflow(input.workflowId) : undefined;
      if (input.workflowId && !workflow) throw new HttpError(400, "Unknown department workflow");
      if (input.workflowId && !input.assignedAgentId) throw new HttpError(400, "A workflow requires an assigned agent");
      if (input.assignedAgentId) {
        const agent = await client.query("SELECT id, department FROM agents WHERE organization_id = $1 AND id = $2 AND enabled = true", [input.organizationId, input.assignedAgentId]);
        if (!agent.rowCount) throw new HttpError(400, "Assigned agent must exist in this organization and be enabled");
        if (workflow && agent.rows[0].department !== workflow.department) throw new HttpError(400, "Workflow department must match the assigned agent");
      }
      const result = await client.query(
        "INSERT INTO tasks (organization_id, project_id, assigned_agent_id, workflow_id, workflow_input, title, description, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id, organization_id AS \"organizationId\", project_id AS \"projectId\", assigned_agent_id AS \"assignedAgentId\", workflow_id AS \"workflowId\", workflow_input AS \"workflowInput\", title, description, status, created_at AS \"createdAt\"",
        [input.organizationId, input.projectId ?? null, input.assignedAgentId ?? null, workflow?.id ?? null, JSON.stringify(input.workflowInput), input.title, input.description, userId],
      );
      const created = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'task.created', 'task', $3, $4::jsonb)",
        [input.organizationId, userId, created.id, JSON.stringify({ title: input.title, projectId: input.projectId ?? null, assignedAgentId: input.assignedAgentId ?? null, workflowId: workflow?.id ?? null })],
      );
      return created;
    });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

const CancelTask = z.object({ organizationId: z.string().uuid() });

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return Response.json({ error: "A valid task id is required" }, { status: 400 });
    const parsed = CancelTask.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid task cancellation request" }, { status: 400 });
    const organizationId = parsed.data.organizationId;
    const task = await withOrganization(organizationId, ["owner", "admin", "operator"], async (client, userId) => {
      const result = await client.query(
        "UPDATE tasks SET status = 'cancelled', locked_at = NULL, locked_by = NULL, updated_at = now() WHERE organization_id = $1 AND id = $2 AND status IN ('queued', 'running', 'waiting_approval') RETURNING id, status",
        [organizationId, id],
      );
      if (!result.rowCount) throw new HttpError(409, "Task is missing or cannot be cancelled in its current state");
      await client.query(
        "UPDATE approvals SET status = 'rejected', decided_at = now(), decided_by = $2 WHERE organization_id = $1 AND task_id = $3 AND status = 'pending'",
        [organizationId, userId, id],
      );
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'task.cancelled', 'task', $3, '{}'::jsonb)",
        [organizationId, userId, id],
      );
      return result.rows[0];
    });
    return Response.json({ task });
  } catch (error) { return apiError(error); }
}
