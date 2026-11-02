import { z } from "zod";
import { apiError, HttpError, readJson, requireSameOrigin, withOrganization } from "@/lib/db";
import { isApprovalAction, isApprovalRequired } from "@/lib/approval-policy";

export const runtime = "nodejs";

const CreateApproval = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  details: z.record(z.string(), z.unknown()).default({}),
});
const DecideApproval = z.object({
  organizationId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      return Response.json({ error: "A valid organizationId is required" }, { status: 400 });
    }
    const approvals = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, organization_id AS \"organizationId\", task_id AS \"taskId\", action, details, status, requested_at AS \"requestedAt\", decided_at AS \"decidedAt\" FROM approvals WHERE organization_id = $1 ORDER BY requested_at DESC LIMIT 100",
        [organizationId],
      );
      return result.rows;
    });
    return Response.json({ approvals });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = CreateApproval.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid approval request", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    const approval = await withOrganization(input.organizationId, ["owner", "admin", "operator"], async (client, userId) => {
      if (!isApprovalAction(input.action)) throw new HttpError(400, "Unsupported approval action category");
      const task = await client.query(
        "SELECT t.id, t.workflow_id AS \"workflowId\", a.policy FROM tasks t LEFT JOIN agents a ON a.organization_id = t.organization_id AND a.id = t.assigned_agent_id WHERE t.organization_id = $1 AND t.id = $2 AND t.status IN ('queued', 'running') FOR UPDATE OF t",
        [input.organizationId, input.taskId],
      );
      if (!task.rowCount) throw new HttpError(409, "Task is missing or is not eligible for an approval request");
      if (!isApprovalRequired(input.action, task.rows[0].workflowId ?? null, task.rows[0].policy)) {
        throw new HttpError(400, "This action is not required or authorised by the task approval policy");
      }
      const duplicate = await client.query(
        "SELECT id FROM approvals WHERE organization_id = $1 AND task_id = $2 AND action = $3 AND status = 'pending' LIMIT 1",
        [input.organizationId, input.taskId, input.action],
      );
      if (duplicate.rowCount) throw new HttpError(409, "A pending approval already exists for this action");
      await client.query("UPDATE tasks SET status = 'waiting_approval', updated_at = now() WHERE organization_id = $1 AND id = $2", [input.organizationId, input.taskId]);
      const result = await client.query(
        "INSERT INTO approvals (organization_id, task_id, action, details, requested_by) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id, organization_id AS \"organizationId\", task_id AS \"taskId\", action, details, status, requested_at AS \"requestedAt\"",
        [input.organizationId, input.taskId, input.action, JSON.stringify(input.details), userId],
      );
      const created = result.rows[0];
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'approval.requested', 'approval', $3, $4::jsonb)",
        [input.organizationId, userId, created.id, JSON.stringify({ action: input.action, taskId: input.taskId })],
      );
      return created;
    });
    return Response.json({ approval }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return Response.json({ error: "A valid approval id is required" }, { status: 400 });
    const parsed = DecideApproval.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid approval decision" }, { status: 400 });
    const input = parsed.data;
    const approval = await withOrganization(input.organizationId, ["owner", "admin"], async (client, userId) => {
      const updated = await client.query(
        "UPDATE approvals SET status = $1, decided_at = now(), decided_by = $2 WHERE organization_id = $3 AND id = $4 AND status = 'pending' AND requested_by IS DISTINCT FROM $2 RETURNING id, task_id AS \"taskId\", status",
        [input.decision, userId, input.organizationId, id],
      );
      if (!updated.rowCount) throw new HttpError(409, "Approval is missing or has already been decided");
      const item = updated.rows[0];
      await client.query(
        "UPDATE tasks SET status = $1, updated_at = now() WHERE organization_id = $2 AND id = $3 AND status = 'waiting_approval'",
        [input.decision === "approved" ? "queued" : "cancelled", input.organizationId, item.taskId],
      );
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', $3, 'approval', $4, $5::jsonb)",
        [input.organizationId, userId, "approval." + input.decision, id, JSON.stringify({ taskId: item.taskId })],
      );
      return item;
    });
    return Response.json({ approval });
  } catch (error) { return apiError(error); }
}
