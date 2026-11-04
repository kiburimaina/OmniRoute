import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { markExpiredDispatchesUncertain } from "@/lib/durable-action-dispatch";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const RecoverRequest = z.object({
  organizationId: z.string().uuid(),
  leaseSeconds: z.number().int().min(10).max(3600).default(120),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = RecoverRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid action recovery request" }, { status: 400 });
    const { organizationId, leaseSeconds } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);
    const recovered = await withWorkerTransaction(organizationId, async (client) => {
      const count = await markExpiredDispatchesUncertain(client, organizationId, leaseSeconds);
      if (count > 0) {
        await client.query(
          "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, metadata) VALUES ($1, 'system', 'worker.actions_marked_uncertain', 'action_dispatch', $2::jsonb)",
          [organizationId, JSON.stringify({ count, leaseSeconds, retryAllowed: false })],
        );
      }
      return count;
    });
    return Response.json({ recovered, status: "uncertain", automaticRetry: false });
  } catch (error) {
    return apiError(error);
  }
}
