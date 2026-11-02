import { describe, expect, it } from "vitest";
import { getWorkflow } from "../src/lib/department-workflows";
import { InvalidWorkflowOutput, validateTaskOutput } from "../src/lib/workflow-output";
import type { PreparedExecution } from "../src/lib/agent-runtime";

function execution(workflowId: string | null): PreparedExecution {
  const workflow = workflowId ? getWorkflow(workflowId) : undefined;
  return {
    taskId: "task-id",
    agentId: "agent-id",
    department: workflow?.department ?? "operations",
    workflow,
    workflowInput: {},
    policy: { maxSteps: 8, maxRuntimeSeconds: 60, maxOutputTokens: 0, allowedTools: [], requireApprovalFor: [] },
    providerExecutionEnabled: false,
    externalToolsEnabled: false,
  };
}
function key(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

describe("workflow output validation", () => {
  it("requires every declared section for a workflow", () => {
    const plan = getWorkflow("dev-feature-plan")!;
    const sections = Object.fromEntries(plan.outputContract.map((label) => [key(label), "Reviewed content"]));
    expect(validateTaskOutput(execution(plan.id), { summary: "Plan prepared", data: { sections } }).summary).toBe("Plan prepared");
  });
  it("rejects missing and unexpected sections", () => {
    const plan = getWorkflow("sales-lead-qualification")!;
    expect(() => validateTaskOutput(execution(plan.id), { summary: "Done", data: { sections: { customer_need: "Need" } } })).toThrow(InvalidWorkflowOutput);
    const complete = Object.fromEntries(plan.outputContract.map((label) => [key(label), "Reviewed content"]));
    expect(() => validateTaskOutput(execution(plan.id), { summary: "Done", data: { sections: { ...complete, invented: "No" } } })).toThrow("unsupported sections");
  });
  it("rejects empty section values and accepts general task structured output", () => {
    const plan = getWorkflow("ops-sop-draft")!;
    const sections = Object.fromEntries(plan.outputContract.map((label) => [key(label), ""]));
    expect(() => validateTaskOutput(execution(plan.id), { summary: "Draft", data: { sections } })).toThrow(InvalidWorkflowOutput);
    expect(validateTaskOutput(execution(null), { summary: "General", data: { notes: ["one"] } }).summary).toBe("General");
  });
});
