import { z } from "zod";
import { apiError, withOrganization } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const taskId = url.searchParams.get("taskId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success || !taskId || !z.string().uuid().safeParse(taskId).success) {
      return Response.json({ error: "Valid organizationId and taskId are required" }, { status: 400 });
    }
    const attempts = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, attempt_number AS \"attemptNumber\", worker_id AS \"workerId\", status, started_at AS \"startedAt\", finished_at AS \"finishedAt\", output, error_message AS \"errorMessage\" FROM task_execution_attempts WHERE organization_id = $1 AND task_id = $2 ORDER BY attempt_number DESC LIMIT 10",
        [organizationId, taskId],
      );
      return result.rows;
    });
    return Response.json({ attempts });
  } catch (error) {
    return apiError(error);
  }
}
