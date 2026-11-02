import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

export class AuthorizationError extends Error {
  constructor(message: string) { super(message); this.name = "AuthorizationError"; }
}

// Stable JSON encoding makes approval hashes independent of object key order.
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + stableJson(record[key])).join(",") + "}";
}

export function approvalPayloadHash(action: string, details: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson({ action, details }), "utf8").digest("hex");
}

/** Consume an approval atomically. Call inside the same transaction as the consequential action. */
export async function consumeApproval(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<string> {
  const hash = approvalPayloadHash(action, details);
  const result = await client.query<{ id: string }>(
    `UPDATE approvals
     SET consumed_at = now(), consumed_by_task = $2
     WHERE organization_id = $1 AND task_id = $2 AND action = $3
       AND payload_hash = $4 AND status = 'approved'
       AND expires_at > now() AND consumed_at IS NULL
     RETURNING id`,
    [organizationId, taskId, action, hash],
  );
  if (!result.rowCount) throw new AuthorizationError("A matching, unexpired, unused approval is required");
  return result.rows[0].id;
}

export type SpendReservation = { id: string; amountMicros: number };

/** Reserve against an explicitly enabled finite organization cap. Missing/disabled budgets fail closed. */
export async function reserveSpend(
  client: PoolClient,
  organizationId: string,
  taskId: string | null,
  provider: string,
  model: string,
  amountMicros: number,
  idempotencyKey: string,
): Promise<SpendReservation> {
  if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) throw new AuthorizationError("Spend reservation must be a positive safe integer in micros");
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(idempotencyKey)) throw new AuthorizationError("Invalid spend idempotency key");
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(provider) || !/^[a-zA-Z0-9._:-]{1,120}$/.test(model)) throw new AuthorizationError("Invalid provider or model identifier");

  const existing = await client.query<{ id: string; amount_micros: string; provider: string; model: string; status: string }>(
    "SELECT id, amount_micros::text, provider, model, status FROM spend_reservations WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE",
    [organizationId, idempotencyKey],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (Number(row.amount_micros) !== amountMicros || row.provider !== provider || row.model !== model || row.status !== "reserved") {
      throw new AuthorizationError("Spend idempotency key was already used for a different or completed reservation");
    }
    return { id: row.id, amountMicros };
  }

  const budget = await client.query(
    `UPDATE organization_spend_budgets
     SET reserved_micros = reserved_micros + $2, updated_at = now()
     WHERE organization_id = $1 AND enabled = true
       AND spent_micros + reserved_micros + $2 <= limit_micros
     RETURNING organization_id`,
    [organizationId, amountMicros],
  );
  if (!budget.rowCount) throw new AuthorizationError("No enabled budget or the hard spending limit would be exceeded");

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO spend_reservations
       (organization_id, task_id, provider, model, amount_micros, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [organizationId, taskId, provider, model, amountMicros, idempotencyKey],
  );
  return { id: inserted.rows[0].id, amountMicros };
}

/** Settle actual provider cost, returning unused reserved funds to the available cap. */
export async function settleSpend(
  client: PoolClient,
  organizationId: string,
  reservationId: string,
  actualMicros: number,
): Promise<void> {
  if (!Number.isSafeInteger(actualMicros) || actualMicros < 0) throw new AuthorizationError("Actual spend must be a non-negative safe integer in micros");
  const reservation = await client.query<{ amount_micros: string }>(
    "SELECT amount_micros::text FROM spend_reservations WHERE organization_id = $1 AND id = $2 AND status = 'reserved' FOR UPDATE",
    [organizationId, reservationId],
  );
  if (!reservation.rowCount) throw new AuthorizationError("Spend reservation is missing or already finalised");
  const reserved = Number(reservation.rows[0].amount_micros);
  if (actualMicros > reserved) throw new AuthorizationError("Actual spend exceeds the approved reservation");
  await client.query(
    "UPDATE spend_reservations SET status = 'settled', settled_at = now() WHERE organization_id = $1 AND id = $2 AND status = 'reserved'",
    [organizationId, reservationId],
  );
  await client.query(
    "UPDATE organization_spend_budgets SET reserved_micros = reserved_micros - $2, spent_micros = spent_micros + $3, updated_at = now() WHERE organization_id = $1",
    [organizationId, reserved, actualMicros],
  );
}

/** Release a reservation when a provider call is not made. */
export async function releaseSpend(client: PoolClient, organizationId: string, reservationId: string): Promise<void> {
  const reservation = await client.query<{ amount_micros: string }>(
    "UPDATE spend_reservations SET status = 'released', settled_at = now() WHERE organization_id = $1 AND id = $2 AND status = 'reserved' RETURNING amount_micros::text",
    [organizationId, reservationId],
  );
  if (!reservation.rowCount) throw new AuthorizationError("Spend reservation is missing or already finalised");
  await client.query(
    "UPDATE organization_spend_budgets SET reserved_micros = reserved_micros - $2, updated_at = now() WHERE organization_id = $1",
    [organizationId, Number(reservation.rows[0].amount_micros)],
  );
}
