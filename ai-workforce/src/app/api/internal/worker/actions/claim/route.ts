import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { claimDurableDispatch } from "@/lib/durable-action-dispatch";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const ClaimRequest = z.object({
  organizationId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = ClaimRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid action claim request" }, { status: 400 });
    const { organizationId, workerId } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);
    const dispatch = await withWorkerTransaction(organizationId, async (client) => {
      const claimed = await claimDurableDispatch(client, organizationId, workerId);
      if (claimed) {
        await client.query(
          "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.action_claimed', 'action_dispatch', $2, $3::jsonb)",
          [organizationId, claimed.id, JSON.stringify({ workerId, action: claimed.action })],
        );
      }
      return claimed;
    });
    // This endpoint only leases approved intent. It never invokes a handler or side effect.
    return Response.json({ claimed: Boolean(dispatch), dispatch });
  } catch (error) {
    return apiError(error);
  }
}
