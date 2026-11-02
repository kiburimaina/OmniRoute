import "server-only";
import type { PoolClient } from "pg";
import { consumeApproval, reserveSpend, type SpendReservation } from "./approval-authorization";
import { isApprovalAction } from "./approval-policy";

export type ApprovedActionRequest = {
  organizationId: string;
  taskId: string;
  action: string;
  details: Record<string, unknown>;
  spend?: {
    provider: string;
    model: string;
    amountMicros: number;
    idempotencyKey: string;
  };
};

export type AuthorizedAction = {
  approvalId: string;
  organizationId: string;
  taskId: string;
  action: string;
  payloadHash: string;
  reservation: SpendReservation | null;
};

/**
 * Establishes one-use authorization inside the caller's transaction.
 * The caller MUST commit this transaction before invoking a separately
 * registered action handler. Any error rolls back both approval consumption
 * and the optional spend reservation. This module never performs side effects.
 */
export async function authorizeApprovedAction(
  client: PoolClient,
  request: ApprovedActionRequest,
): Promise<AuthorizedAction> {
  if (!isApprovalAction(request.action)) throw new Error("Action category is not eligible for approval");
  const approvalId = await consumeApproval(
    client,
    request.organizationId,
    request.taskId,
    request.action,
    request.details,
  );

  let reservation: SpendReservation | null = null;
  if (request.spend) {
    reservation = await reserveSpend(
      client,
      request.organizationId,
      request.taskId,
      request.spend.provider,
      request.spend.model,
      request.spend.amountMicros,
      request.spend.idempotencyKey,
    );
  }

  const payloadHashResult = await client.query<{ payload_hash: string }>(
    "SELECT payload_hash FROM approvals WHERE organization_id = $1 AND id = $2",
    [request.organizationId, approvalId],
  );
  const payloadHash = payloadHashResult.rows[0]?.payload_hash?.trim();
  if (!payloadHash || !/^[a-f0-9]{64}$/.test(payloadHash)) {
    throw new Error("Consumed approval has an invalid payload binding");
  }

  await client.query(
    "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'action.authorized', 'approval', $2, $3::jsonb)",
    [request.organizationId, approvalId, JSON.stringify({
      taskId: request.taskId,
      action: request.action,
      payloadHash,
      spendReservationId: reservation?.id ?? null,
    })],
  );

  return {
    approvalId,
    organizationId: request.organizationId,
    taskId: request.taskId,
    action: request.action,
    payloadHash,
    reservation,
  };
}
