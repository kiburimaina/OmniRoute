import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { AgentExecutionPolicy, assertWithinExecutionBudget, isToolAllowed, prepareTaskExecution } from "../src/lib/agent-runtime";

const org = "9f54a8aa-4e1b-4d2b-ae5a-52f4c50c4e2a";
const agent = "a5e6d8aa-4e1b-4d2b-ae5a-52f4c50c4e2a";
const task = "b5e6d8aa-4e1b-4d2b-ae5a-52f4c50c4e2a";
function fakeClient(row: unknown) {
 const query = vi.fn(async (..._args: unknown[]) => ({ rows: [_args[0] && String(_args[0]).includes("SELECT t.id") ? row : {}], rowCount: 1 }));
 return { client: { query } as unknown as PoolClient, query };
}
const baseRow = { taskId: task, agentId: agent, taskStatus: "running", lockedBy: "worker-a", attemptStartedAt: new Date(), agentEnabled: true, department: "operations", policy: { maxSteps: 5, maxRuntimeSeconds: 30, maxOutputTokens: 0, allowedTools: ["crm.lookup"] } };

describe("agent execution policy gate", () => {
 it("prepares a leased task with platform provider/tool execution disabled", async () => {
  const { client } = fakeClient(baseRow);
  const plan = await prepareTaskExecution(client, org, task, "worker-a");
  expect(plan.providerExecutionEnabled).toBe(false);
  expect(plan.externalToolsEnabled).toBe(false);
  expect(plan.policy.maxSteps).toBe(5);
 });
 it("blocks tasks not leased by the requesting worker", async () => {
  const { client } = fakeClient({ ...baseRow, lockedBy: "worker-b" });
  await expect(prepareTaskExecution(client, org, task, "worker-a")).rejects.toThrow("not leased");
 });
 it("blocks a result when the active execution attempt exceeded its runtime budget", async () => {
  const expired = fakeClient({ ...baseRow, attemptStartedAt: new Date(Date.now() - 31_000) });
  await expect(prepareTaskExecution(expired.client, org, task, "worker-a")).rejects.toThrow("runtime budget exhausted");
 });
 it("blocks disabled or unassigned agents", async () => {
  const disabled = fakeClient({ ...baseRow, agentEnabled: false });
  await expect(prepareTaskExecution(disabled.client, org, task, "worker-a")).rejects.toThrow("no enabled assigned agent");
  const unassigned = fakeClient({ ...baseRow, agentId: null });
  await expect(prepareTaskExecution(unassigned.client, org, task, "worker-a")).rejects.toThrow("no enabled assigned agent");
 });
 it("fails closed on invalid policy JSON", async () => {
  const { client } = fakeClient({ ...baseRow, policy: { maxSteps: 999 } });
  await expect(prepareTaskExecution(client, org, task, "worker-a")).rejects.toThrow("policy is invalid");
 });
 it("does not permit tools before platform registry approval", () => {
  const policy = { maxSteps: 5, maxRuntimeSeconds: 30, maxOutputTokens: 100, allowedTools: ["crm.lookup"], requireApprovalFor: [] } as AgentExecutionPolicy;
  expect(isToolAllowed(policy, "crm.lookup")).toBe(false);
 });
 it("enforces step, time, and model token budgets", () => {
  const policy = { maxSteps: 2, maxRuntimeSeconds: 10, maxOutputTokens: 100, allowedTools: [], requireApprovalFor: [] } as AgentExecutionPolicy;
  expect(() => assertWithinExecutionBudget(policy, 1000, 2, 1000)).toThrow("step budget");
  expect(() => assertWithinExecutionBudget(policy, 1000, 1, 12000)).toThrow("runtime budget");
  expect(() => assertWithinExecutionBudget({ ...policy, maxOutputTokens: 0 }, 1000, 1, 1000)).toThrow("Model execution is disabled");
 });
});
