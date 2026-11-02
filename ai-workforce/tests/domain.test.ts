import { describe, expect, it } from "vitest";
import {
  ApprovalStatusSchema,
  ProjectSchema,
  TaskSchema,
  TaskStatusSchema,
} from "../src/lib/domain";

const orgId = "f2c6c7c4-4c7a-4a92-9d31-12d67e1c5f01";
const projectId = "0a9f2a6e-8c0e-4b7e-bd43-9c8f41e7a311";

describe("domain validation", () => {
  it("accepts valid projects and applies the description default", () => {
    const result = ProjectSchema.parse({
      id: projectId,
      organizationId: orgId,
      name: "Website launch",
      createdAt: "2026-11-02T12:00:00.000Z",
    });
    expect(result.description).toBe("");
  });

  it("rejects projects with invalid organization IDs or blank names", () => {
    expect(ProjectSchema.safeParse({
      id: projectId,
      organizationId: "invalid",
      name: "Website",
      createdAt: "2026-11-02T12:00:00.000Z",
    }).success).toBe(false);
    expect(ProjectSchema.safeParse({
      id: projectId,
      organizationId: orgId,
      name: "   ",
      createdAt: "2026-11-02T12:00:00.000Z",
    }).success).toBe(false);
  });

  it("accepts valid task states and rejects unknown states", () => {
    expect(TaskStatusSchema.safeParse("waiting_approval").success).toBe(true);
    expect(TaskStatusSchema.safeParse("launched").success).toBe(false);
  });

  it("validates task identity and nullable project association", () => {
    expect(TaskSchema.safeParse({
      id: projectId,
      organizationId: orgId,
      projectId: null,
      title: "Review onboarding",
      status: "queued",
      createdAt: "2026-11-02T12:00:00.000Z",
    }).success).toBe(true);
    expect(TaskSchema.safeParse({
      id: projectId,
      organizationId: "bad",
      projectId: null,
      title: "Review onboarding",
      status: "queued",
      createdAt: "2026-11-02T12:00:00.000Z",
    }).success).toBe(false);
  });

  it("keeps approval states constrained", () => {
    expect(ApprovalStatusSchema.safeParse("pending").success).toBe(true);
    expect(ApprovalStatusSchema.safeParse("approved").success).toBe(true);
    expect(ApprovalStatusSchema.safeParse("executed").success).toBe(false);
  });
});
