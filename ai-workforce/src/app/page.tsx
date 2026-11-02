import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withUserTransaction } from "@/lib/db";

const metrics = [
  ["Active agents", "0", "Agents are disabled until configured"],
  ["Open tasks", "0", "No tasks have been submitted"],
  ["Awaiting approval", "0", "Sensitive actions require your review"],
  ["Provider spend", "$0.00", "Paid providers are disabled by default"],
];

const departments = [
  { name: "Development", detail: "Architecture, frontend, backend, database, QA, and security work.", state: "Not configured" },
  { name: "Sales", detail: "Website chat, lead qualification, product guidance, and customer follow-up.", state: "Not configured" },
  { name: "Operations", detail: "CRM workflows, customer support, reporting, and approved automations.", state: "Not configured" },
];

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const organizations = await withUserTransaction(async (client, userId) => {
    const result = await client.query(
      `SELECT o.id, o.name, m.role
       FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = $1
       ORDER BY o.created_at ASC`,
      [userId],
    );
    return result.rows as Array<{ id: string; name: string; role: string }>;
  });

  if (organizations.length === 0) redirect("/onboarding");
  const organization = organizations[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI <span>WORKFORCE</span></div>
        <div className="nav-label">Workspace</div>
        <a className="nav-item active" href="/">Overview</a>
        <a className="nav-item" href="#departments">Departments</a>
        <a className="nav-item" href="#tasks">Tasks</a>
        <a className="nav-item" href="#approvals">Approvals</a>
        <div className="nav-label">Manage</div>
        <a className="nav-item" href="#projects">Projects</a>
        <a className="nav-item" href="#settings">Settings</a>
        <form action="/api/auth/sign-out" method="post"><button className="nav-item signout" type="submit">Sign out</button></form>
      </aside>
      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Command centre · {organization.name}</div>
            <h1>Good to have you here, {session.user.name}.</h1>
            <p className="sub">Your AI teams, projects, and business operations in one place.</p>
          </div>
          <span className="pill">Foundation preview · Phase 2</span>
        </div>
        <section className="grid" aria-label="Platform metrics">
          {metrics.map(([label, value, note]) => (
            <article className="card" key={label}>
              <div className="metric-label">{label}</div>
              <div className="metric">{value}</div>
              <div className="metric-note">{note}</div>
            </article>
          ))}
        </section>
        <section id="departments">
          <h2 className="section-title">Your departments</h2>
          <div className="departments">
            {departments.map((department) => (
              <article className="card department" key={department.name}>
                <h3>{department.name}</h3>
                <p>{department.detail}</p>
                <div className="status"><span className="dot" />{department.state}</div>
              </article>
            ))}
          </div>
        </section>
        <div className="notice">
          Safety mode is active. No agent can send customer messages, spend money, merge code, or deploy software from this preview. Authentication is enabled, but database migrations, email verification, and tenant-isolation tests remain before production.
        </div>
      </main>
    </div>
  );
}
