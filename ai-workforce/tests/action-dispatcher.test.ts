import { describe, expect, it } from "vitest";
import {
  ActionDispatchDenied,
  authorizeActionDispatch,
  registeredActionTypes,
  runAuthorizedAction,
} from "../src/lib/action-dispatcher";

describe("controlled action dispatcher", () => {
  it("starts with no executable action handlers", () => {
    expect(registeredActionTypes()).toEqual([]);
  });

  it("does not invoke or authorize an action when no reviewed handler exists", async () => {
    const client = { query: async () => { throw new Error("database must not be touched"); } } as unknown as import("pg").PoolClient;
    await expect(authorizeActionDispatch(client, {
      organizationId: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002",
      action: "external_message",
      details: { recipient: "customer-1", body: "Hello" },
    })).rejects.toBeInstanceOf(ActionDispatchDenied);
  });

  it("rejects forged or deserialized authorization tokens", async () => {
    await expect(runAuthorizedAction({
      authorization: {
        approvalId: "approval-1",
        organizationId: "org-1",
        taskId: "task-1",
        action: "purchase",
        payloadHash: "a".repeat(64),
        reservation: null,
      },
      details: { sku: "sku-1" },
    })).rejects.toThrow("live authorization token");
  });
});
