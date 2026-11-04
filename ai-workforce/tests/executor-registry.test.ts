import { describe, expect, it, vi } from "vitest";
import type { PreparedExecution } from "../src/lib/agent-runtime";
import {
  ExecutorRegistry,
  ExecutorUnavailable,
  platformExecutorRegistry,
  type TaskExecutor,
} from "../src/lib/executor-registry";

const prepared = {
  taskId: "task-1",
  agentId: "agent-1",
  department: "development",
  workflow: undefined,
  workflowInput: {},
  policy: {
    maxSteps: 8,
    maxRuntimeSeconds: 60,
    maxOutputTokens: 0,
    allowedTools: [],
    requireApprovalFor: ["deploy"],
  },
  providerExecutionEnabled: false,
  externalToolsEnabled: false,
} as unknown as PreparedExecution;

function executor(id: string, supports = () => true): TaskExecutor {
  return {
    id,
    supports,
    execute: vi.fn(async () => ({ summary: "test", data: {} })),
  };
}

describe("ExecutorRegistry", () => {
  it("ships with no enabled platform executors", () => {
    expect(platformExecutorRegistry.list()).toEqual([]);
    expect(() => platformExecutorRegistry.resolve(prepared)).toThrow(ExecutorUnavailable);
  });

  it("resolves exactly one compatible executor", () => {
    const registry = new ExecutorRegistry();
    const adapter = executor("test-deterministic");
    registry.register(adapter);
    expect(registry.resolve(prepared)).toBe(adapter);
  });

  it("does not select an incompatible executor", () => {
    const registry = new ExecutorRegistry();
    registry.register(executor("test-incompatible", () => false));
    expect(() => registry.resolve(prepared)).toThrow(ExecutorUnavailable);
  });

  it("blocks ambiguous executor configuration", () => {
    const registry = new ExecutorRegistry();
    registry.register(executor("test-one"));
    registry.register(executor("test-two"));
    expect(() => registry.resolve(prepared)).toThrow(/Multiple executors match/);
  });

  it("rejects duplicate and malformed executor identifiers", () => {
    const registry = new ExecutorRegistry();
    registry.register(executor("test-valid"));
    expect(() => registry.register(executor("test-valid"))).toThrow(/already registered/);
    expect(() => registry.register(executor("Bad_ID"))).toThrow(/Executor id/);
  });
});
