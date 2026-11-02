import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { completeTask, failTask } from "@/lib/task-queue";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

const ResultRequest = z.object({
  organizationId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
  outcome: z.enum(["succeeded", "failed"]),
  error: z.string().max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (value.outcome === "failed" && !value.error?.trim()) {
    context.addIssue({ code: "custom", path: ["error"], message: "A failure reason is required" });
  }
});

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    requireWorkerAuthentication(request);
    const { taskId } = await context.params;
    if (!z.string().uuid().safeParse(taskId).success) return Response.json({ error: "Invalid task id" }, { status: 400 });
    const parsed = ResultRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker result", details: parsed.error.flatten() }, { status: 400 });
    const { organizationId, workerId, outcome, error } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);
    const result = await withWorkerTransaction(organizationId, async (client) => {
      if (outcome === "succeeded") {
        const changed = await completeTask(client, organizationId, taskId, workerId);
        if (!changed) return "not_owned";
        await client.query(
          "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_succeeded', 'task', $2, $3::jsonb)",
          [organizationId, taskId, JSON.stringify({ workerId })],
        );
        return "succeeded";
      }
      const state = await failTask(client, organizationId, taskId, workerId, error ?? "Worker reported failure");
      if (state === "not_owned") return state;
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_failed', 'task', $2, $3::jsonb)",
        [organizationId, taskId, JSON.stringify({ workerId, retryState: state, error: (error ?? "").slice(0, 500) })],
      );
      return state;
    });
    if (result === "not_owned") return Response.json({ error: "Task lease is missing or belongs to another worker" }, { status: 409 });
    return Response.json({ status: result });
  } catch (error) { return apiError(error); }
}
