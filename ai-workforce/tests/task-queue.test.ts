import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { claimNextTask, completeTask, failTask, heartbeatTask, recoverExpiredLeases } from "../src/lib/task-queue";

function clientWith(results: Array<{ rows?: unknown[]; rowCount?: number }>) {
  const query = vi.fn(async (..._args: unknown[]) => {
    const next = results.shift() ?? {};
    return { rows: next.rows ?? [], rowCount: next.rowCount ?? 0 };
  });
  return { client: { query } as unknown as PoolClient, query };
}

const org = "9f54a8aa-4e1b-4d2b-ae5a-52f4c50c4e2a";

describe("tenant-scoped task queue", () => {
  it("sets tenant context before claiming a single queued task", async () => {
    const task = { id: "task-1", organizationId: org, title: "Build", description: "", attemptCount: 1, maxAttempts: 3 };
    const { client, query } = clientWith([{ rows: [] }, { rows: [] }, { rows: [{ count: "0" }] }, { rows: [task], rowCount: 1 }]);
    await expect(claimNextTask(client, org, "worker-1")).resolves.toEqual(task);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[4][0]).toContain("INSERT INTO task_execution_attempts");
    expect(query.mock.calls[0][0]).toContain("set_config('app.current_org_id'");
    expect(query.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[3][0]).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("does not claim beyond the worker concurrency limit", async () => {
    const { client, query } = clientWith([{ rows: [] }, { rows: [] }, { rows: [{ count: "2" }] }]);
    await expect(claimNextTask(client, org, "worker-1", 2)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid worker concurrency limits", async () => {
    const { client, query } = clientWith([]);
    await expect(claimNextTask(client, org, "worker-1", 11)).rejects.toThrow("Invalid worker concurrency");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects malformed tenant and worker identifiers", async () => {
    const { client, query } = clientWith([]);
    await expect(claimNextTask(client, "bad-id", "worker")).rejects.toThrow("Invalid organization id");
    await expect(claimNextTask(client, org, "bad worker")).rejects.toThrow("Invalid worker id");
    expect(query).not.toHaveBeenCalled();
  });

  it("only completes a task owned by the worker lease", async () => {
    const { client, query } = clientWith([{ rows: [] }, { rowCount: 1 }]);
    await expect(completeTask(client, org, "task-1", "worker-1")).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain("set_config");
    expect(query.mock.calls[1][0]).toContain("locked_by = $3");
  });

  it("renews only a lease owned by the worker and within the agent runtime", async () => {
    const { client, query } = clientWith([{ rows: [] }, { rowCount: 1 }]);
    await expect(heartbeatTask(client, org, "task-1", "worker-1")).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain("set_config");
    expect(query.mock.calls[1][0]).toContain("locked_by = $3");
    expect(query.mock.calls[1][0]).toContain("attempt.started_at");
    expect(query.mock.calls[1][0]).toContain("maxRuntimeSeconds");
    expect(query.mock.calls[1][0]).toContain("LEAST(300, GREATEST(5");
    expect(query.mock.calls[1][0]).toContain("ELSE 60 END");
  });

  it("returns retry state from the bounded exponential retry update", async () => {
    const { client, query } = clientWith([{ rows: [] }, { rows: [{ status: "queued" }], rowCount: 1 }]);
    await expect(failTask(client, org, "task-1", "worker-1", "temporary error")).resolves.toBe("queued");
    expect(query.mock.calls[0][0]).toContain("set_config");
    expect(query.mock.calls[1][0]).toContain("LEAST(300");
  });

  it("bounds lease recovery duration and scopes it to the organization", async () => {
    const { client, query } = clientWith([{}, { rowCount: 2 }]);
    await expect(recoverExpiredLeases(client, org, 99999)).resolves.toBe(2);
    expect(query.mock.calls[0][0]).toContain("set_config('app.current_org_id'");
    expect(query.mock.calls[1][1]).toEqual([org, 3600]);
  });
});
