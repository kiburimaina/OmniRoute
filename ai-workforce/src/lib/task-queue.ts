import "server-only";
import type { PoolClient } from "pg";

export type LeasedTask = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  attemptCount: number;
  maxAttempts: number;
};

const WORKER_ID = /^[a-zA-Z0-9._:-]{1,120}$/;

// Call only inside a transaction using a dedicated worker identity.
// RLS remains active and is scoped to the supplied organization.
export async function claimNextTask(
  client: PoolClient,
  organizationId: string,
  workerId: string,
): Promise<LeasedTask | null> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  if (!WORKER_ID.test(workerId)) throw new Error("Invalid worker id");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const result = await client.query<LeasedTask>(
    `WITH candidate AS (
       SELECT id FROM tasks
       WHERE organization_id = $1 AND status = 'queued' AND available_at <= now()
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE tasks AS task
     SET status = 'running', locked_at = now(), locked_by = $2,
         attempt_count = task.attempt_count + 1, updated_at = now()
     FROM candidate
     WHERE task.id = candidate.id
     RETURNING task.id, task.organization_id AS "organizationId", task.title,
       task.description, task.attempt_count AS "attemptCount", task.max_attempts AS "maxAttempts"`,
    [organizationId, workerId],
  );
  return result.rows[0] ?? null;
}

export async function completeTask(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  workerId: string,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const result = await client.query(
    `UPDATE tasks SET status = 'succeeded', locked_at = NULL, locked_by = NULL,
       last_error = NULL, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND status = 'running' AND locked_by = $3`,
    [organizationId, taskId, workerId],
  );
  return result.rowCount === 1;
}

export async function failTask(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  workerId: string,
  errorMessage: string,
): Promise<"queued" | "failed" | "not_owned"> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const safeMessage = errorMessage.slice(0, 2000);
  const result = await client.query<{ status: "queued" | "failed" }>(
    `UPDATE tasks
     SET status = CASE WHEN attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
         available_at = CASE WHEN attempt_count < max_attempts
           THEN now() + make_interval(secs => LEAST(300, power(2, GREATEST(0, attempt_count - 1))::int))
           ELSE available_at END,
         locked_at = NULL, locked_by = NULL, last_error = $4, updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND status = 'running' AND locked_by = $3
     RETURNING status`,
    [organizationId, taskId, workerId, safeMessage],
  );
  return result.rows[0]?.status ?? "not_owned";
}

// Recover expired leases. Invoke from a scheduled worker maintenance loop.
export async function recoverExpiredLeases(
  client: PoolClient,
  organizationId: string,
  leaseSeconds = 300,
): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const seconds = Math.max(30, Math.min(3600, Math.trunc(leaseSeconds)));
  const result = await client.query(
    `UPDATE tasks SET
       status = CASE WHEN attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
       available_at = now(), locked_at = NULL, locked_by = NULL,
       last_error = COALESCE(last_error, 'Worker lease expired'), updated_at = now()
     WHERE organization_id = $1 AND status = 'running'
       AND locked_at < now() - make_interval(secs => $2)`,
    [organizationId, seconds],
  );
  return result.rowCount ?? 0;
}
