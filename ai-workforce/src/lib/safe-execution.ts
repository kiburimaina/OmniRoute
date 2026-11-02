import type { PreparedExecution } from "./agent-runtime";
import { ExecutorUnavailable, type ExecutorRegistry } from "./executor-registry";
import type { TaskOutput } from "./task-queue";
import { InvalidWorkflowOutput, validateTaskOutput } from "./workflow-output";

export class ExecutionAborted extends Error {
  constructor(message = "Task execution was cancelled") {
    super(message);
    this.name = "ExecutionAborted";
  }
}

export class ExecutionBudgetExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionBudgetExceeded";
  }
}

/**
 * Runs one pure-data executor. The executor has no database client or platform
 * tools; approvals, persistence and external side effects remain outside it.
 * Production passes the empty platform registry until an adapter is reviewed.
 */
export async function runPreparedTask(
  execution: PreparedExecution,
  registry: ExecutorRegistry,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<TaskOutput> {
  const startedAt = now();
  const deadline = startedAt + execution.policy.maxRuntimeSeconds * 1000;
  const check = () => {
    if (signal.aborted) throw new ExecutionAborted();
    if (now() > deadline) throw new ExecutionBudgetExceeded("Agent runtime budget exhausted");
  };

  check();
  if (execution.providerExecutionEnabled || execution.externalToolsEnabled) {
    throw new ExecutorUnavailable("This execution plan requests capabilities disabled by platform policy");
  }
  if (execution.policy.maxSteps < 1) {
    throw new ExecutionBudgetExceeded("Agent step budget exhausted");
  }

  const executor = registry.resolve(execution);
  check();
  const output = await executor.execute({ execution, startedAt, signal });
  check();
  try {
    return validateTaskOutput(execution, output);
  } catch (error) {
    if (error instanceof InvalidWorkflowOutput) throw error;
    throw new InvalidWorkflowOutput("Executor returned an invalid task output");
  }
}
