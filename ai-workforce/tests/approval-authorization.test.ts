import { describe, expect, it } from "vitest";
import { approvalPayloadHash } from "../src/lib/approval-authorization";

describe("approval payload binding", () => {
  it("is stable when object keys are reordered", () => {
    expect(approvalPayloadHash("external_message", { recipient: "customer-1", body: "Hello" }))
      .toBe(approvalPayloadHash("external_message", { body: "Hello", recipient: "customer-1" }));
  });

  it("changes when the action or any payload value changes", () => {
    const original = approvalPayloadHash("external_message", { recipient: "customer-1", body: "Hello" });
    expect(approvalPayloadHash("publish", { recipient: "customer-1", body: "Hello" })).not.toBe(original);
    expect(approvalPayloadHash("external_message", { recipient: "customer-1", body: "Goodbye" })).not.toBe(original);
    expect(approvalPayloadHash("external_message", { recipient: "customer-2", body: "Hello" })).not.toBe(original);
  });

  it("returns a SHA-256 hex digest", () => {
    expect(approvalPayloadHash("purchase", { sku: "A-1", quantity: 2 })).toMatch(/^[a-f0-9]{64}$/);
  });
});
