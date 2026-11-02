import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { heartbeatTask } from "@/lib/task-queue";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";

const HeartbeatRequest = z.object({
  organizationId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    requireWorkerAuthentication(request);
    const { taskId } = await context.params;
    if (!z.string().uuid().safeParse(taskId).success) return Response.json({ error: "Invalid task id" }, { status: 400 });
    const parsed = HeartbeatRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid heartbeat request" }, { status: 400 });
    const { organizationId, workerId } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);
    const renewed = await withWorkerTransaction(organizationId, (client) => heartbeatTask(client, organizationId, taskId, workerId));
    if (!renewed) return Response.json({ error: "Task lease is missing or belongs to another worker" }, { status: 409 });
    return Response.json({ renewed: true });
  } catch (error) { return apiError(error); }
}
