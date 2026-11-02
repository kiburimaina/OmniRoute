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

export default function HomePage() {
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
      </aside>
      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Command centre</div>
            <h1>Good to have you here.</h1>
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
          Safety mode is active. No agent can send customer messages, spend money, merge code, or deploy software from this preview. Authentication and persistent storage must be configured before this dashboard is exposed to users.
        </div>
      </main>
    </div>
  );
}
