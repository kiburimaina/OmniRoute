import { describe, expect, it } from "vitest";
import { DEPARTMENT_WORKFLOWS, getDepartmentWorkflows, getWorkflow } from "../src/lib/department-workflows";

describe("department workflows", () => {
  it("defines workflows for every department", () => {
    expect(new Set(DEPARTMENT_WORKFLOWS.map((workflow) => workflow.department))).toEqual(new Set(["development", "sales", "operations"]));
  });
  it("requires review for consequential actions", () => {
    for (const workflow of DEPARTMENT_WORKFLOWS) {
      expect(workflow.approvalActions.length).toBeGreaterThan(0);
      expect(workflow.outputContract.length).toBeGreaterThan(0);
      expect(workflow.requiredInputs.length).toBeGreaterThan(0);
    }
  });
  it("filters workflows by department and resolves identifiers", () => {
    expect(getDepartmentWorkflows("sales").every((workflow) => workflow.department === "sales")).toBe(true);
    expect(getWorkflow("sales-lead-qualification")?.approvalActions).toContain("external_message");
    expect(getWorkflow("unknown-workflow")).toBeUndefined();
  });
});
