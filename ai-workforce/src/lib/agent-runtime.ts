import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { getWorkflow } from "./department-workflows";

const AgentPolicySchema = z.object({
  maxSteps: z.number().int().min(1).max(20).default(8),
  maxRuntimeSeconds: z.number().int().min(5).max(300).default(60),
  maxOutputTokens: z.number().int().min(0).max(4000).default(0),
  allowedTools: z.array(z.string().min(1).max(80)).max(20).default([]),
  requireApprovalFor: z.array(z.string().min(1).max(120)).max(50).default(["external_message", "publish", "purchase", "deploy", "repository_merge"]),
}).strict();

export type AgentExecutionPolicy = z.infer<typeof AgentPolicySchema>;
export type PreparedExecution = {
  taskId: string;
  agentId: string;
  department: "development" | "sales" | "operations";
  workflow: ReturnType<typeof getWorkflow>;
  workflowInput: Record<string, unknown>;
  policy: AgentExecutionPolicy;
  providerExecutionEnabled: false;
  externalToolsEnabled: false;
};

export class ExecutionDenied extends Error {
  constructor(message: string) { super(message); this.name = "ExecutionDenied"; }
}

export async function prepareTaskExecution(
  client: PoolClient,
  organizationId: string,
  taskId: string,
  workerId: string,
): Promise<PreparedExecution> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new ExecutionDenied("Invalid organization scope");
  await client.query("SELECT set_config('app.current_org_id', $1, true)", [organizationId]);
  const result = await client.query<{
    taskId: string; agentId: string | null; taskStatus: string; lockedBy: string | null; workflowId: string | null; workflowInput: Record<string, unknown>;
    agentEnabled: boolean | null; department: "development" | "sales" | "operations" | null; policy: unknown;
  }>(
    `SELECT t.id AS "taskId", t.assigned_agent_id AS "agentId", t.status AS "taskStatus",
       t.locked_by AS "lockedBy", t.workflow_id AS "workflowId", t.workflow_input AS "workflowInput", a.enabled AS "agentEnabled", a.department, a.policy
     FROM tasks t LEFT JOIN agents a
       ON a.organization_id = t.organization_id AND a.id = t.assigned_agent_id
     WHERE t.organization_id = $1 AND t.id = $2`,
    [organizationId, taskId],
  );
  const task = result.rows[0];
  if (!task || task.taskStatus !== "running" || task.lockedBy !== workerId) {
    throw new ExecutionDenied("Task is not leased by this worker");
  }
  if (!task.agentId || task.agentEnabled !== true || !task.department) {
    throw new ExecutionDenied("Task has no enabled assigned agent");
  }
  const workflow = task.workflowId ? getWorkflow(task.workflowId) : undefined;
  if (task.workflowId && (!workflow || workflow.department !== task.department)) throw new ExecutionDenied("Task workflow is missing or incompatible with its assigned agent");
  const parsed = AgentPolicySchema.safeParse(task.policy ?? {});
  if (!parsed.success) throw new ExecutionDenied("Agent policy is invalid; execution is blocked");
  return {
    taskId: task.taskId,
    agentId: task.agentId,
    department: task.department,
    workflow,
    workflowInput: task.workflowInput ?? {},
    policy: parsed.data,
    providerExecutionEnabled: false,
    externalToolsEnabled: false,
  };
}

// A capability can only be used when both the agent policy and platform registry allow it.
// The platform registry is intentionally empty until individual tools are security-reviewed.
const PLATFORM_TOOL_REGISTRY = new Set<string>();

export function isToolAllowed(policy: AgentExecutionPolicy, toolName: string): boolean {
  return policy.allowedTools.includes(toolName) && PLATFORM_TOOL_REGISTRY.has(toolName);
}

export function assertWithinExecutionBudget(
  policy: AgentExecutionPolicy,
  startedAt: number,
  stepsUsed: number,
  now = Date.now(),
): void {
  if (stepsUsed >= policy.maxSteps) throw new ExecutionDenied("Agent step budget exhausted");
  if (now - startedAt > policy.maxRuntimeSeconds * 1000) throw new ExecutionDenied("Agent runtime budget exhausted");
  if (policy.maxOutputTokens === 0) throw new ExecutionDenied("Model execution is disabled by the platform budget");
}
