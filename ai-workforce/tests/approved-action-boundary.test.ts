import { describe, expect, it, vi } from "vitest";
import { authorizeApprovedAction } from "../src/lib/approved-action-boundary";

function clientMock() {
  const query = vi.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "approval-1" }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "reservation-1", amount_micros: "250" }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ payload_hash: "a".repeat(64) }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] });
  return { query } as unknown as import("pg").PoolClient & { query: typeof query };
}

describe("approved action boundary", () => {
  it("consumes the exact approval, reserves spend, and writes an audit record", async () => {
    const client = clientMock();
    const result = await authorizeApprovedAction(client, {
      organizationId: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002",
      action: "external_message",
      details: { recipient: "customer-1", body: "Hello" },
      spend: { provider: "example", model: "model-v1", amountMicros: 250, idempotencyKey: "task-1-message-1" },
    });
    expect(result.approvalId).toBe("approval-1");
    expect(result.reservation).toEqual({ id: "reservation-1", amountMicros: 250 });
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(String(client.query.mock.calls[0][0])).toContain("UPDATE approvals");
    expect(String(client.query.mock.calls[1][0])).toContain("organization_spend_budgets");
    expect(String(client.query.mock.calls[3][0])).toContain("audit_events");
  });

  it("rejects unapproved action categories before touching the database", async () => {
    const client = { query: vi.fn() } as unknown as import("pg").PoolClient;
    await expect(authorizeApprovedAction(client, {
      organizationId: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002",
      action: "run_shell",
      details: {},
    })).rejects.toThrow("not eligible");
    expect(client.query).not.toHaveBeenCalled();
  });

  it("fails closed when the approval cannot be consumed", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as unknown as import("pg").PoolClient;
    await expect(authorizeApprovedAction(client, {
      organizationId: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002",
      action: "purchase",
      details: { sku: "sku-1" },
    })).rejects.toThrow("matching, unexpired, unused approval");
  });
});
