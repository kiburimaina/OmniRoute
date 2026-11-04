import { describe, expect, it } from "vitest";
import { isApprovalAction, isApprovalRequired } from "../src/lib/approval-policy";

describe("backend approval policy", () => {
  it("recognises only supported consequential action categories", () => {
    expect(isApprovalAction("external_message")).toBe(true);
    expect(isApprovalAction("delete_everything")).toBe(false);
  });
  it("requires workflow-defined approvals", () => {
    expect(isApprovalRequired("external_message", "sales-lead-qualification", {})).toBe(true);
    expect(isApprovalRequired("purchase", "sales-lead-qualification", {})).toBe(false);
    expect(isApprovalRequired("repository_merge", "dev-feature-plan", {})).toBe(true);
  });
  it("uses agent policy for general tasks and fails closed for unknown workflows", () => {
    expect(isApprovalRequired("publish", null, { requireApprovalFor: ["publish"] })).toBe(true);
    expect(isApprovalRequired("external_message", null, { requireApprovalFor: [] })).toBe(false);
    expect(isApprovalRequired("external_message", "missing-workflow", { requireApprovalFor: ["external_message"] })).toBe(false);
    expect(isApprovalRequired("unsupported", null, {})).toBe(false);
  });
});
