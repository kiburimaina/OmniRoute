import "server-only";
import { withWorkerTransaction } from "./db";
import { prepareTaskExecution } from "./agent-runtime";
import { platformExecutorRegistry, type ExecutorRegistry } from "./executor-registry";
import { runPreparedTask } from "./safe-execution";
import { completeTask, failTask, type TaskOutput } from "./task-queue";

export type ExecutionOutcome =
  | { accepted: true; status: "succeeded"; output: TaskOutput }
  | { accepted: false; status: "not_owned" | "failed"; reason: string };

/**
 * Prepare and persist in short transactions; run executor code with no database
 * connection held. Completion re-checks the live lease and runtime deadline.
 */
export async function executeLeasedTask(
  organizationId: string,
  taskId: string,
  workerId: string,
  registry: ExecutorRegistry = platformExecutorRegistry,
): Promise<ExecutionOutcome> {
  const execution = await withWorkerTransaction(organizationId, (client) =>
    prepareTaskExecution(client, organizationId, taskId, workerId),
  );

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedExecution = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Agent runtime budget exhausted"));
      }, execution.policy.maxRuntimeSeconds * 1000);
    });
    const output = await Promise.race([
      runPreparedTask(execution, registry, controller.signal),
      timedExecution,
    ]);
    if (timeout) clearTimeout(timeout);

    const persisted = await withWorkerTransaction(organizationId, async (client) => {
      // Re-read the attempt and policy after executor work; expired or recovered
      // leases cannot commit an otherwise valid stale result.
      await prepareTaskExecution(client, organizationId, taskId, workerId);
      const completed = await completeTask(client, organizationId, taskId, workerId, output);
      if (!completed) return false;
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_succeeded', 'task', $2, $3::jsonb)",
        [organizationId, taskId, JSON.stringify({ workerId, executor: "registered" })],
      );
      return true;
    });
    return persisted
      ? { accepted: true, status: "succeeded", output }
      : { accepted: false, status: "not_owned", reason: "Task lease is no longer owned by this worker" };
  } catch (error) {
    controller.abort();
    const message = error instanceof Error ? error.message : "Task execution failed";
    const status = await withWorkerTransaction(organizationId, async (client) => {
      const failed = await failTask(client, organizationId, taskId, workerId, message);
      if (failed === "not_owned") return failed;
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, 'agent', 'worker.task_failed', 'task', $2, $3::jsonb)",
        [organizationId, taskId, JSON.stringify({ workerId, retryStatus: failed })],
      );
      return failed;
    });
    return { accepted: false, status: status === "not_owned" ? "not_owned" : "failed", reason: message };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
