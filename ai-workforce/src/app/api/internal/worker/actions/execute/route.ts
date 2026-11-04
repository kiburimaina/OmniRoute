import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { getClaimedDurableDispatch, finishDurableDispatch, markDispatchUncertain } from "@/lib/durable-action-dispatch";
import { invokeRegisteredActionHandler, ActionDispatchDenied } from "@/lib/action-dispatcher";
import { requireWorkerAuthentication, requireWorkerOrganizationAccess } from "@/lib/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const ExecuteRequest = z.object({
  organizationId: z.string().uuid(),
  dispatchId: z.string().uuid(),
  workerId: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
  leaseSeconds: z.number().int().min(10).max(3600).default(120),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = ExecuteRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid action execution request" }, { status: 400 });
    const { organizationId, dispatchId, workerId, leaseSeconds } = parsed.data;
    requireWorkerOrganizationAccess(organizationId);

    const dispatch = await withWorkerTransaction(organizationId, async (client) => {
      const claimed = await getClaimedDurableDispatch(client, organizationId, dispatchId, workerId, leaseSeconds);
      if (!claimed) return null;
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.action_execution_started', 'action_dispatch', $2, $3::jsonb)",
        [organizationId, dispatchId, JSON.stringify({ workerId, action: claimed.action })],
      );
      return claimed;
    });
    if (!dispatch) return Response.json({ error: "No live dispatch lease owned by this worker" }, { status: 409 });

    let result;
    try {
      result = await invokeRegisteredActionHandler(dispatch);
    } catch (error) {
      const noHandler = error instanceof ActionDispatchDenied &&
        error.message === "No reviewed handler is registered for this action";
      if (noHandler) {
        await withWorkerTransaction(organizationId, async (client) => {
          await finishDurableDispatch(client, organizationId, dispatchId, workerId, { status: "failed", errorCode: "no_reviewed_handler" });
          await client.query(
            "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'system', 'worker.action_execution_rejected', 'action_dispatch', $2, $3::jsonb)",
            [organizationId, dispatchId, JSON.stringify({ reason: "no_reviewed_handler" })],
          );
        });
        return Response.json({ error: "No reviewed handler is registered; no side effect was attempted" }, { status: 409 });
      }
      // A handler may have performed a side effect before throwing. Never retry blindly.
      await withWorkerTransaction(organizationId, async (client) => {
        await markDispatchUncertain(client, organizationId, dispatchId, workerId, "handler_outcome_uncertain");
        await client.query(
          "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'system', 'worker.action_execution_uncertain', 'action_dispatch', $2, $3::jsonb)",
          [organizationId, dispatchId, JSON.stringify({ reason: "handler_outcome_uncertain" })],
        );
      });
      return Response.json({ status: "uncertain", automaticRetry: false }, { status: 202 });
    }

    await withWorkerTransaction(organizationId, async (client) => {
      await finishDurableDispatch(client, organizationId, dispatchId, workerId, {
        status: "succeeded",
        ...(result.reference ? { resultReference: result.reference } : {}),
      });
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.action_execution_completed', 'action_dispatch', $2, $3::jsonb)",
        [organizationId, dispatchId, JSON.stringify({ workerId, outcome: result.status, reference: result.reference ?? null })],
      );
    });
    return Response.json({ status: "succeeded", outcome: result.status, reference: result.reference ?? null });
  } catch (error) {
    return apiError(error);
  }
}
