import { describe, expect, it } from "vitest";
import { AGENT_TEMPLATES, getAgentTemplate } from "../src/lib/agent-templates";

describe("department agent templates", () => {
  it("provides roles across all three departments", () => {
    expect(new Set(AGENT_TEMPLATES.map((item) => item.department))).toEqual(new Set(["development", "sales", "operations"]));
  });
  it("uses safe disabled-by-default execution budgets", () => {
    for (const template of AGENT_TEMPLATES) {
      expect(template.policy.maxOutputTokens).toBe(0);
      expect(template.policy.allowedTools).toEqual([]);
      expect(template.policy.requireApprovalFor).toContain("external_message");
    }
  });
  it("resolves known templates and rejects unknown identifiers", () => {
    expect(getAgentTemplate("sales-receptionist")?.name).toBe("AI Receptionist");
    expect(getAgentTemplate("unknown-role")).toBeUndefined();
  });
});
