import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(connectionString);
const pool = enabled ? new Pool({ connectionString, max: 2 }) : null;

describe.skipIf(!enabled)("PostgreSQL tenant isolation", () => {
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

      await expect(client.query(
        "INSERT INTO projects (organization_id, name) VALUES ($1, 'Cross-tenant write')",
        [orgB],
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("does not grant the runtime role elevated PostgreSQL privileges", async () => {
    const result = await pool!.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
    });
  });
});
