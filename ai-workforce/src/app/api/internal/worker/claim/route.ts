import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { prepareTaskExecution } from "@/lib/agent-runtime";
import { claimNextTask } from "@/lib/task-queue";
import { requireWorkerAuthentication } from "@/lib/worker-auth";

export const runtime = "nodejs";

const ClaimRequest = z.object({
  organizationId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = ClaimRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker claim request" }, { status: 400 });
    const { organizationId, workerId } = parsed.data;
    const result = await withWorkerTransaction(organizationId, async (client) => {
      const task = await claimNextTask(client, organizationId, workerId);
      if (!task) return null;
      const execution = await prepareTaskExecution(client, organizationId, task.id, workerId);
      return { task, execution };
    });
    if (!result) return Response.json({ task: null }, { status: 204 });
    return Response.json({
      task: result.task,
      execution: {
        agentId: result.execution.agentId,
        department: result.execution.department,
        policy: result.execution.policy,
        providerExecutionEnabled: false,
        externalToolsEnabled: false,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
