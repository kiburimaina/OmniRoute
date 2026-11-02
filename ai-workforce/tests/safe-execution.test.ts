import { describe, expect, it, vi } from "vitest";
import type { PreparedExecution } from "../src/lib/agent-runtime";
import { ExecutorRegistry } from "../src/lib/executor-registry";
import { ExecutionAborted, ExecutionBudgetExceeded, runPreparedTask } from "../src/lib/safe-execution";

function execution(overrides: Partial<PreparedExecution> = {}): PreparedExecution {
  return {
    taskId: "task-1",
    agentId: "agent-1",
    department: "operations",
    workflow: undefined,
    workflowInput: {},
    policy: {
      maxSteps: 8,
      maxRuntimeSeconds: 60,
      maxOutputTokens: 0,
      allowedTools: [],
      requireApprovalFor: ["external_message", "publish", "purchase", "deploy", "repository_merge"],
    },
    providerExecutionEnabled: false,
    externalToolsEnabled: false,
    ...overrides,
  };
}

function registryWith(execute: () => Promise<unknown> = async () => ({
  summary: "Completed safely",
  data: { notes: ["reviewed"] },
})): ExecutorRegistry {
  const registry = new ExecutorRegistry();
  registry.register({
    id: "test-executor",
    supports: () => true,
    execute: vi.fn(async () => execute() as never),
  });
  return registry;
}

describe("safe execution gate", () => {
  it("runs a registered executor and validates its structured output", async () => {
    const output = await runPreparedTask(execution(), registryWith(), new AbortController().signal);
    expect(output).toEqual({ summary: "Completed safely", data: { notes: ["reviewed"] } });
  });

  it("blocks provider execution even when an executor is registered", async () => {
    await expect(runPreparedTask(
      execution({ providerExecutionEnabled: true as false }),
      registryWith(),
      new AbortController().signal,
    )).rejects.toThrow("disabled by platform policy");
  });

  it("blocks external tools even when an executor is registered", async () => {
    await expect(runPreparedTask(
      execution({ externalToolsEnabled: true as false }),
      registryWith(),
      new AbortController().signal,
    )).rejects.toThrow("disabled by platform policy");
  });

  it("honours cancellation before invoking an executor", async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = registryWith();
    await expect(runPreparedTask(execution(), executor, controller.signal)).rejects.toBeInstanceOf(ExecutionAborted);
  });

  it("enforces the runtime budget", async () => {
    await expect(runPreparedTask(
      execution({ policy: { ...execution().policy, maxRuntimeSeconds: 5 } }),
      registryWith(),
      new AbortController().signal,
      () => 6_000,
    )).rejects.toBeInstanceOf(ExecutionBudgetExceeded);
  });

  it("rejects malformed executor output", async () => {
    await expect(runPreparedTask(
      execution(),
      registryWith(async () => ({ summary: "", data: {} })),
      new AbortController().signal,
    )).rejects.toThrow("concise summary and structured data");
  });

  it("fails closed when no executor is registered", async () => {
    await expect(runPreparedTask(
      execution(),
      new ExecutorRegistry(),
      new AbortController().signal,
    )).rejects.toThrow("No approved executor");
  });
});
