import { describe, expect, it, vi } from "vitest";
import type { PreparedExecution } from "../src/lib/agent-runtime";
import { ExecutorRegistry } from "../src/lib/executor-registry";
import { ExecutionAborted, ExecutionBudgetExceeded, runPreparedTask } from "../src/lib/safe-execution";

const execution = {
  taskId: "task-1",
  agentId: "agent-1",
  department: "operations",
  workflow: undefined,
  workflowInput: {},
  policy: { maxSteps: 4, maxRuntimeSeconds: 30, maxOutputTokens: 0, allowedTools: [], requireApprovalFor: [] },
  providerExecutionEnabled: false,
  externalToolsEnabled: false,
} as PreparedExecution;

describe("safe prepared task runner", () => {
  it("runs one pure-data executor and validates its structured output", async () => {
    const registry = new ExecutorRegistry();
    const execute = vi.fn(async () => ({ summary: "Reviewed", data: { findings: [] } }));
    registry.register({ id: "test-runner", supports: () => true, execute });
    const result = await runPreparedTask(execution, registry, new AbortController().signal);
    expect(result.summary).toBe("Reviewed");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("fails closed when no executor is registered", async () => {
    await expect(runPreparedTask(execution, new ExecutorRegistry(), new AbortController().signal))
      .rejects.toThrow("No approved executor");
  });

  it("does not invoke an executor after cancellation", async () => {
    const registry = new ExecutorRegistry();
    const execute = vi.fn();
    registry.register({ id: "test-runner", supports: () => true, execute });
    const controller = new AbortController();
    controller.abort();
    await expect(runPreparedTask(execution, registry, controller.signal)).rejects.toBeInstanceOf(ExecutionAborted);
    expect(execute).not.toHaveBeenCalled();
  });

  it("enforces the runtime deadline before invocation", async () => {
    const registry = new ExecutorRegistry();
    const execute = vi.fn();
    registry.register({ id: "test-runner", supports: () => true, execute });
    let clock = 100;
    await expect(runPreparedTask(execution, registry, new AbortController().signal, () => {
      const value = clock;
      clock += 31_000;
      return value;
    })).rejects.toBeInstanceOf(ExecutionBudgetExceeded);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed executor output", async () => {
    const registry = new ExecutorRegistry();
    registry.register({ id: "test-runner", supports: () => true, execute: async () => ({ summary: "", data: {} }) });
    await expect(runPreparedTask(execution, registry, new AbortController().signal)).rejects.toThrow("invalid task output");
  });
});
