import type { PreparedExecution } from "./agent-runtime";
import type { TaskOutput } from "./task-queue";

/**
 * An executor is a deliberately narrow adapter. It receives a pre-authorised
 * execution plan and may only return structured data; persistence, approvals,
 * tools, and external side effects remain owned by the platform.
 */
export type ExecutionContext = {
  execution: PreparedExecution;
  startedAt: number;
  signal: AbortSignal;
};

export type TaskExecutor = {
  id: string;
  supports: (execution: PreparedExecution) => boolean;
  execute: (context: ExecutionContext) => Promise<TaskOutput>;
};

export class ExecutorUnavailable extends Error {
  constructor(message = "No approved executor is configured for this task") {
    super(message);
    this.name = "ExecutorUnavailable";
  }
}

function validateExecutorId(id: string): void {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
    throw new TypeError("Executor id must be 2-64 lowercase letters, numbers, or hyphens and start with a letter");
  }
}

/** Registry instances are explicit; the platform default intentionally has no executors. */
export class ExecutorRegistry {
  private readonly executors = new Map<string, TaskExecutor>();

  register(executor: TaskExecutor): void {
    validateExecutorId(executor.id);
    if (this.executors.has(executor.id)) {
      throw new TypeError(`Executor "${executor.id}" is already registered`);
    }
    if (typeof executor.supports !== "function" || typeof executor.execute !== "function") {
      throw new TypeError("Executor must provide supports and execute functions");
    }
    this.executors.set(executor.id, executor);
  }

  resolve(execution: PreparedExecution): TaskExecutor {
    const matches = [...this.executors.values()].filter((executor) => executor.supports(execution));
    if (matches.length === 0) throw new ExecutorUnavailable();
    if (matches.length > 1) {
      throw new ExecutorUnavailable("Multiple executors match this task; execution is blocked until the configuration is unambiguous");
    }
    return matches[0];
  }

  list(): string[] {
    return [...this.executors.keys()];
  }
}

/** Fail-closed default: no model, shell, repository, messaging, or browser executor. */
export const platformExecutorRegistry = new ExecutorRegistry();
