import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { completeTask, failTask } from "@/lib/task-queue";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

const ResultRequest = z.discriminatedUnion("outcome", [
  z.object({
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
    outcome: z.literal("succeeded"),
    output: z.object({
      summary: z.string().trim().min(1).max(2000),
      data: z.record(z.string(), z.unknown()).default({}),
    }).strict(),
  }).strict(),
  z.object({
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
    outcome: z.literal("failed"),
    error: z.string().trim().min(1).max(4000),
  }).strict(),
]);

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = ResultRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker result" }, { status: 400 });
    const input = parsed.data;
    requireWorkerOrganizationAccess(input.organizationId);
    const result = await withWorkerTransaction(input.organizationId, async (client) => {
      if (input.outcome === "succeeded") {
        const completed = await completeTask(client, input.organizationId, input.taskId, input.workerId, input.output);
        if (!completed) return { accepted: false as const };
        await client.query(
          "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_succeeded', 'task', $2, $3::jsonb)",
          [input.organizationId, input.taskId, JSON.stringify({ workerId: input.workerId })],
        );
        return { accepted: true as const, status: "succeeded" as const };
      }
      const status = await failTask(client, input.organizationId, input.taskId, input.workerId, input.error);
      if (status === "not_owned") return { accepted: false as const };
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_failed', 'task', $2, $3::jsonb)",
        [input.organizationId, input.taskId, JSON.stringify({ workerId: input.workerId, retryStatus: status })],
      );
      return { accepted: true as const, status };
    });
    if (!result.accepted) return Response.json({ error: "Task lease is not owned by this worker" }, { status: 409 });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
