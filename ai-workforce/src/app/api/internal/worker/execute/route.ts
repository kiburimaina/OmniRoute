import { z } from "zod";
import { apiError, readJson } from "@/lib/db";
import { executeLeasedTask } from "@/lib/execution-coordinator";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 330;

const ExecuteRequest = z.object({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = ExecuteRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker execution request" }, { status: 400 });
    const { organizationId, taskId, workerId } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);
    const result = await executeLeasedTask(organizationId, taskId, workerId);
    if (!result.accepted) {
      return Response.json({ error: result.reason, status: result.status }, { status: result.status === "not_owned" ? 409 : 422 });
    }
    return Response.json({ accepted: true, status: result.status, output: result.output });
  } catch (error) {
    return apiError(error);
  }
}
