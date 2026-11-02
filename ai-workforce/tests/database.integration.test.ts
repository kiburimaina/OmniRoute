import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { approvalPayloadHash, consumeApproval, reserveSpend, settleSpend, releaseSpend } from "../src/lib/approval-authorization";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(connectionString);
const pool = enabled ? new Pool({ connectionString, max: 4 }) : null;

describe.skipIf(!enabled)("PostgreSQL tenant isolation and authorization controls", () => {
  afterAll(async () => { await pool?.end(); });

  it("isolates tenant rows and rejects cross-tenant writes for the app role", async () => {
    const client = await pool!.connect();
    const orgA = "a1000000-0000-4000-8000-000000000001";
    const orgB = "b2000000-0000-4000-8000-000000000002";
    const userA = "a1000000-0000-4000-8000-000000000011";
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO organizations (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", [orgA, orgB]);
      await client.query("INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [orgA, userA]);
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgA]);
      await client.query("INSERT INTO projects (organization_id, name) VALUES ($1, 'Visible project')", [orgA]);
      const visible = await client.query("SELECT name FROM projects");
      expect(visible.rows.map((row) => row.name)).toEqual(["Visible project"]);
      const hidden = await client.query("SELECT id FROM projects WHERE organization_id = $1", [orgB]);
      expect(hidden.rowCount).toBe(0);
      await expect(client.query("INSERT INTO projects (organization_id, name) VALUES ($1, 'Cross-tenant write')", [orgB]))
        .rejects.toMatchObject({ code: "42501" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("does not grant the runtime role elevated PostgreSQL privileges", async () => {
    const result = await pool!.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    expect(result.rows[0]).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  });

  it("consumes an exact approval once and rejects replay, payload substitution and expiry", async () => {
    const client = await pool!.connect();
    const org = "c3000000-0000-4000-8000-000000000003";
    const user = "c3000000-0000-4000-8000-000000000013";
    const task = "c3000000-0000-4000-8000-000000000023";
    const details = { recipient: "customer-1", body: "Approved message" };
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO organizations (id, name) VALUES ($1, 'Approval tenant')", [org]);
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
      await client.query("INSERT INTO tasks (id, organization_id, title, created_by, status) VALUES ($1, $2, 'Send approved message', $3, 'running')", [task, org, user]);
      const hash = approvalPayloadHash("external_message", details);
      const first = await client.query(
        "INSERT INTO approvals (organization_id, task_id, action, details, requested_by, payload_hash, status, decided_at, decided_by) VALUES ($1, $2, 'external_message', $3::jsonb, $4, $5, 'approved', now(), $6) RETURNING id",
        [org, task, JSON.stringify(details), user, hash, "c3000000-0000-4000-8000-000000000014"],
      );
      await expect(consumeApproval(client, org, task, "external_message", { ...details, body: "Changed message" }))
        .rejects.toThrow(/matching, unexpired, unused/);
      await expect(consumeApproval(client, org, task, "external_message", details)).resolves.toBe(first.rows[0].id);
      await expect(consumeApproval(client, org, task, "external_message", details))
        .rejects.toThrow(/matching, unexpired, unused/);

      const expiredTask = "c3000000-0000-4000-8000-000000000024";
      await client.query("INSERT INTO tasks (id, organization_id, title, created_by, status) VALUES ($1, $2, 'Expired approval', $3, 'running')", [expiredTask, org, user]);
      await client.query(
        "INSERT INTO approvals (organization_id, task_id, action, requested_by, payload_hash, expires_at) VALUES ($1, $2, 'purchase', $3, $4, now() - interval '1 second')",
        [org, expiredTask, user, approvalPayloadHash("purchase", { sku: "sku-1" })],
      );
      await expect(consumeApproval(client, org, expiredTask, "purchase", { sku: "sku-1" }))
        .rejects.toThrow(/matching, unexpired, unused/);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("enforces the hard cap under concurrent reservations and settles/releases once", async () => {
    const setup = await pool!.connect();
    const org = "d4000000-0000-4000-8000-000000000004";
    try {
      await setup.query("BEGIN");
      await setup.query("INSERT INTO organizations (id, name) VALUES ($1, 'Budget tenant')", [org]);
      await setup.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
      await setup.query("INSERT INTO organization_spend_budgets (organization_id, limit_micros, enabled) VALUES ($1, 100, true)", [org]);
      await setup.query("COMMIT");
    } catch (error) { await setup.query("ROLLBACK"); throw error; }
    finally { setup.release(); }

    const attempt = async (key: string) => {
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
        const reservation = await reserveSpend(client, org, null, "test-provider", "test-model", 70, key);
        await client.query("COMMIT");
        return reservation;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    };
    const results = await Promise.allSettled([attempt("concurrent-a"), attempt("concurrent-b")]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    const winner = results.find((item): item is PromiseFulfilledResult<{ id: string; amountMicros: number }> => item.status === "fulfilled")!.value;

    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
      await settleSpend(client, org, winner.id, 50);
      await expect(settleSpend(client, org, winner.id, 50)).rejects.toThrow(/missing or already finalised/);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }

    const verify = await pool!.connect();
    try {
      await verify.query("BEGIN");
      await verify.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
      const final = await verify.query("SELECT spent_micros::text, reserved_micros::text FROM organization_spend_budgets WHERE organization_id = $1", [org]);
      expect(final.rows[0]).toEqual({ spent_micros: "50", reserved_micros: "0" });
      await verify.query("ROLLBACK");
    } finally { verify.release(); }
  });

  it("releases a reservation once and restores the available cap", async () => {
    const client = await pool!.connect();
    const org = "e5000000-0000-4000-8000-000000000005";
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO organizations (id, name) VALUES ($1, 'Release tenant')", [org]);
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [org]);
      await client.query("INSERT INTO organization_spend_budgets (organization_id, limit_micros, enabled) VALUES ($1, 25, true)", [org]);
      const reservation = await reserveSpend(client, org, null, "test-provider", "test-model", 25, "release-once");
      await releaseSpend(client, org, reservation.id);
      await expect(releaseSpend(client, org, reservation.id)).rejects.toThrow(/missing or already finalised/);
      const budget = await client.query("SELECT spent_micros, reserved_micros FROM organization_spend_budgets WHERE organization_id = $1", [org]);
      expect(budget.rows[0]).toEqual({ spent_micros: "0", reserved_micros: "0" });
      await client.query("ROLLBACK");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
});
