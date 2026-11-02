import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withOrganization, withUserTransaction } from "@/lib/db";
import { AgentManager } from "./agent-manager";

export const runtime = "nodejs";

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const organizations = await withUserTransaction(async (client, userId) => {
    const result = await client.query(
      `SELECT o.id, o.name, m.role FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = $1 ORDER BY o.created_at ASC LIMIT 1`,
      [userId],
    );
    return result.rows as Array<{ id: string; name: string; role: string }>;
  });
  if (!organizations.length) redirect("/onboarding");
  const organization = organizations[0];
  const agents = await withOrganization(organization.id, ["owner", "admin", "operator", "viewer"], async (client) => {
    const result = await client.query(
      `SELECT id, name, department, enabled, template_id AS "templateId", description, responsibilities FROM agents
       WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organization.id],
    );
    return result.rows as Array<{ id: string; name: string; department: "development" | "sales" | "operations"; enabled: boolean; templateId: string | null; description: string; responsibilities: string[] }>;
  });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI <span>WORKFORCE</span></div>
        <div className="nav-label">Workspace</div>
        <Link className="nav-item" href="/">Overview</Link>
        <a className="nav-item active" href="/agents">Agents</a>
        <div className="nav-label">Workspace</div>
        <span className="nav-item">{organization.name}</span>
      </aside>
      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Agent registry · {organization.role}</div>
            <h1>Build your AI teams</h1>
            <p className="sub">Create the roles your departments need and manage their registry status.</p>
          </div>
          <Link className="pill" href="/">Back to command centre</Link>
        </div>
        <div className="notice">Safety boundary: this page manages agent records only. No model calls, background workers, customer messages, or external actions are triggered.</div>
        <AgentManager organizationId={organization.id} initialAgents={agents} canManage={organization.role === "owner" || organization.role === "admin"} />
      </main>
    </div>
  );
}
