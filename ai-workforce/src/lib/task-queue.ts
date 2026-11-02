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

export type TaskOutput = { summary: string; data: Record<string, unknown> };

function safeErrorMessage(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 2000);
}

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
         attempt_count = task.attempt_count + 1, started_at = COALESCE(task.started_at, now()), completed_at = NULL, result = NULL, updated_at = now()
     FROM candidate
     WHERE task.id = candidate.id
     RETURNING task.id, task.organization_id AS "organizationId", task.title,
       task.description, task.attempt_count AS "attemptCount", task.max_attempts AS "maxAttempts"`,
    [organizationId, workerId],
  );
  const claimed = result.rows[0];
  if (claimed) {
    await client.query(
      "INSERT INTO task_execution_attempts (organization_id, task_id, attempt_number, worker_id, status) VALUES ($1, $2, $3, $4, 'running')",
      [organizationId, claimed.id, claimed.attemptCount, workerId],
    );
  }
  return claimed ?? null;
}

export async function completeTask(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  workerId: string,
  output: TaskOutput = { summary: "Task completed", data: {} },
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  if (!output || typeof output.summary !== "string" || output.summary.length > 2000 || !output.data || typeof output.data !== "object" || Array.isArray(output.data)) throw new Error("Invalid structured task output");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const result = await client.query(
    `UPDATE tasks SET status = 'succeeded', locked_at = NULL, locked_by = NULL,
       result = $4::jsonb, last_error = NULL, completed_at = now(), updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND status = 'running' AND locked_by = $3`,
    [organizationId, taskId, workerId, JSON.stringify(output)],
  );
  if (result.rowCount === 1) {
    await client.query("UPDATE task_execution_attempts SET status = 'succeeded', output = $4::jsonb, finished_at = now() WHERE organization_id = $1 AND task_id = $2 AND worker_id = $3 AND status = 'running'", [organizationId, taskId, workerId, JSON.stringify(output)]);
  }
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
  const safeMessage = safeErrorMessage(errorMessage);
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
  if (result.rows[0]) {
    await client.query("UPDATE task_execution_attempts SET status = 'failed', error_message = $4, finished_at = now() WHERE organization_id = $1 AND task_id = $2 AND worker_id = $3 AND status = 'running'", [organizationId, taskId, workerId, safeMessage]);
  }
  if (result.rows[0]?.status === "failed") await client.query("UPDATE tasks SET completed_at = now() WHERE organization_id = $1 AND id = $2", [organizationId, taskId]);
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
       last_error = COALESCE(last_error, 'Worker lease expired'),
       completed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
       updated_at = now()
     WHERE organization_id = $1 AND status = 'running'
       AND locked_at < now() - make_interval(secs => $2)
     RETURNING id, attempt_count`,
    [organizationId, seconds],
  );
  for (const expired of result.rows as Array<{ id: string; attempt_count: number }>) {
    await client.query("UPDATE task_execution_attempts SET status = 'lease_expired', error_message = 'Worker lease expired', finished_at = now() WHERE organization_id = $1 AND task_id = $2 AND attempt_number = $3 AND status = 'running'", [organizationId, expired.id, expired.attempt_count]);
  }
  return result.rowCount ?? 0;
}

export async function heartbeatTask(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  workerId: string,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid organization id");
  if (!WORKER_ID.test(workerId)) throw new Error("Invalid worker id");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const result = await client.query(
    `UPDATE tasks SET locked_at = now(), updated_at = now()
     WHERE organization_id = $1 AND id = $2 AND status = 'running' AND locked_by = $3`,
    [organizationId, taskId, workerId],
  );
  return result.rowCount === 1;
}
