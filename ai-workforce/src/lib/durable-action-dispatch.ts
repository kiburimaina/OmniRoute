import "server-only";
import type { PoolClient } from "pg";
import type { AuthorizedAction } from "./approved-action-boundary";
import type { ApprovalAction } from "./approval-policy";

export type DurableActionDispatch = Readonly<{
  id: string;
  organizationId: string;
  taskId: string;
  approvalId: string;
  action: ApprovalAction;
  payloadHash: string;
  details: Record<string, unknown>;
  idempotencyKey: string;
}>;

export class DurableDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableDispatchError";
  }
}

function validateIdempotencyKey(value: string): void {
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(value)) {
    throw new DurableDispatchError("Invalid action idempotency key");
  }
}

/** Persist the approved intent in the same transaction that consumed approval. */
export async function persistAuthorizedDispatch(
  client: PoolClient,
  authorization: AuthorizedAction,
  details: Record<string, unknown>,
  idempotencyKey: string,
): Promise<string> {
  validateIdempotencyKey(idempotencyKey);
  const serialized = JSON.stringify(details);
  if (Buffer.byteLength(serialized, "utf8") > 48 * 1024) {
    throw new DurableDispatchError("Action details exceed the durable dispatch limit");
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO action_dispatches
       (organization_id, task_id, approval_id, action, payload_hash, details, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (organization_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      authorization.organizationId,
      authorization.taskId,
      authorization.approvalId,
      authorization.action,
      authorization.payloadHash,
      serialized,
      idempotencyKey,
    ],
  );
  if (inserted.rowCount) return inserted.rows[0].id;

  const existing = await client.query<{
    id: string; task_id: string; approval_id: string; action: string; payload_hash: string; status: string;
  }>(
    `SELECT id, task_id, approval_id, action, payload_hash, status
       FROM action_dispatches
      WHERE organization_id = $1 AND idempotency_key = $2
      FOR UPDATE`,
    [authorization.organizationId, idempotencyKey],
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.task_id !== authorization.taskId ||
    row.approval_id !== authorization.approvalId ||
    row.action !== authorization.action ||
    row.payload_hash.trim() !== authorization.payloadHash ||
    row.status !== "authorized"
  ) {
    throw new DurableDispatchError("Action idempotency key conflicts with an existing dispatch");
  }
  return row.id;
}

/**
 * Claim one authorized dispatch inside a tenant-scoped transaction.
 * No expired running dispatch is reclaimed: recovery marks it uncertain.
 */
export async function claimDurableDispatch(
  client: PoolClient,
  organizationId: string,
  workerId: string,
): Promise<DurableActionDispatch | null> {
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(workerId)) {
    throw new DurableDispatchError("Invalid action worker identifier");
  }
  const result = await client.query<{
    id: string; organization_id: string; task_id: string; approval_id: string;
    action: ApprovalAction; payload_hash: string; details: Record<string, unknown>; idempotency_key: string;
  }>(
    `WITH candidate AS (
       SELECT id FROM action_dispatches
        WHERE organization_id = $1 AND status = 'authorized'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE action_dispatches d
        SET status = 'running', locked_by = $2, locked_at = now(),
            attempts = attempts + 1, updated_at = now()
       FROM candidate
      WHERE d.id = candidate.id
      RETURNING d.id, d.organization_id, d.task_id, d.approval_id, d.action,
                d.payload_hash, d.details, d.idempotency_key`,
    [organizationId, workerId],
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    organizationId: row.organization_id,
    taskId: row.task_id,
    approvalId: row.approval_id,
    action: row.action,
    payloadHash: row.payload_hash.trim(),
    details: row.details,
    idempotencyKey: row.idempotency_key,
  } : null;
}

/** Finalize only the lease owner; callers must audit in the same transaction. */
export async function finishDurableDispatch(
  client: PoolClient,
  organizationId: string,
  dispatchId: string,
  workerId: string,
  outcome: { status: "succeeded" | "failed"; resultReference?: string; errorCode?: string },
): Promise<void> {
  const result = await client.query(
    `UPDATE action_dispatches
        SET status = $4, result_reference = $5, last_error_code = $6,
            completed_at = now(), updated_at = now(), locked_at = NULL, locked_by = NULL
      WHERE organization_id = $1 AND id = $2 AND locked_by = $3 AND status = 'running'`,
    [
      organizationId,
      dispatchId,
      workerId,
      outcome.status,
      outcome.resultReference?.slice(0, 240) ?? null,
      outcome.errorCode?.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 80) ?? null,
    ],
  );
  if (!result.rowCount) throw new DurableDispatchError("Dispatch lease is missing or no longer owned by this worker");
}

/**
 * Expired leases are not retried because the external side effect may already
 * have happened. A human must reconcile the uncertain outcome before retrying.
 */
export async function markExpiredDispatchesUncertain(
  client: PoolClient,
  organizationId: string,
  leaseSeconds: number,
): Promise<number> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
    throw new DurableDispatchError("Invalid action lease duration");
  }
  const result = await client.query(
    `UPDATE action_dispatches
        SET status = 'uncertain', locked_at = NULL, locked_by = NULL,
            last_error_code = 'worker_lease_expired', updated_at = now()
      WHERE organization_id = $1 AND status = 'running'
        AND locked_at < now() - ($2::text || ' seconds')::interval`,
    [organizationId, leaseSeconds],
  );
  return result.rowCount ?? 0;
}


/** Load a dispatch only while its worker still owns a live lease. */
export async function getClaimedDurableDispatch(
  client: PoolClient,
  organizationId: string,
  dispatchId: string,
  workerId: string,
  leaseSeconds: number,
): Promise<DurableActionDispatch | null> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
    throw new DurableDispatchError("Invalid action lease duration");
  }
  const result = await client.query<{
    id: string; organization_id: string; task_id: string; approval_id: string;
    action: ApprovalAction; payload_hash: string; details: Record<string, unknown>; idempotency_key: string;
  }>(
    `SELECT id, organization_id, task_id, approval_id, action, payload_hash, details, idempotency_key
       FROM action_dispatches
      WHERE organization_id = $1 AND id = $2 AND locked_by = $3 AND status = 'running'
        AND locked_at >= now() - ($4::text || ' seconds')::interval
      FOR UPDATE`,
    [organizationId, dispatchId, workerId, leaseSeconds],
  );
  const row = result.rows[0];
  return row ? {
    id: row.id, organizationId: row.organization_id, taskId: row.task_id,
    approvalId: row.approval_id, action: row.action, payloadHash: row.payload_hash.trim(),
    details: row.details, idempotencyKey: row.idempotency_key,
  } : null;
}

/** Mark a potentially side-effecting execution uncertain; never auto-retry it. */
export async function markDispatchUncertain(
  client: PoolClient,
  organizationId: string,
  dispatchId: string,
  workerId: string,
  errorCode: string,
): Promise<void> {
  const result = await client.query(
    `UPDATE action_dispatches
        SET status = 'uncertain', last_error_code = $4,
            completed_at = now(), updated_at = now(), locked_at = NULL, locked_by = NULL
      WHERE organization_id = $1 AND id = $2 AND locked_by = $3 AND status = 'running'`,
    [organizationId, dispatchId, workerId, errorCode.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 80)],
  );
  if (!result.rowCount) throw new DurableDispatchError("Dispatch lease is missing or no longer owned by this worker");
}
