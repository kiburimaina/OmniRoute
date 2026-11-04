"use client";

import { FormEvent, useState } from "react";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";

type Agent = {
  id: string;
  name: string;
  department: "development" | "sales" | "operations";
  enabled: boolean;
  templateId?: string | null;
  description?: string;
  responsibilities?: string[];
};

export function AgentManager({ organizationId, initialAgents, canManage }: {
  organizationId: string;
  initialAgents: Agent[];
  canManage: boolean;
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Agent["department"]>("development");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { organizationId, templateId } : { organizationId, name: name.trim(), department }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not create the agent.");
        return;
      }
      setAgents((current) => [data.agent, ...current]);
      setName("");
      setTemplateId("");
    } catch {
      setError("Could not reach the service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAgent(agent: Agent) {
    setError("");
    try {
      const response = await fetch(`/api/agents?id=${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, enabled: !agent.enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not update the agent.");
        return;
      }
      setAgents((current) => current.map((item) => item.id === agent.id ? data.agent : item));
    } catch {
      setError("Could not reach the service. Please try again.");
    }
  }

  return (
    <div className="agent-layout">
      <section className="card">
        <h2 className="section-title">Registered agents</h2>
        {agents.length === 0 ? <p className="sub">No agents registered yet. Add your first role below.</p> : (
          <div className="agent-list">
            {agents.map((agent) => (
              <article className="agent-row" key={agent.id}>
                <div>
                  <strong>{agent.name}</strong>
                  <p className="sub">{agent.department} department · {agent.enabled ? "Enabled in registry" : "Disabled"}{agent.templateId ? ` · ${agent.templateId}` : ""}</p>{agent.description && <p className="sub">{agent.description}</p>}{Boolean(agent.responsibilities?.length) && <ul>{agent.responsibilities?.map((item) => <li key={item}>{item}</li>)}</ul>}
                </div>
                {canManage && <button className="secondary-button" onClick={() => void toggleAgent(agent)}>{agent.enabled ? "Disable" : "Enable"}</button>}
              </article>
            ))}
          </div>
        )}
      </section>
      {canManage && <section className="card">
        <h2 className="section-title">Add an agent role</h2>
        <p className="sub">New agents are disabled by default. Enabling a registry entry does not start a worker or call an AI provider.</p>
        <form className="agent-form" onSubmit={createAgent}>
          <label>Start from a role template<select value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Custom agent</option>{AGENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.department}</option>)}</select></label>
          {templateId ? <div className="notice">{AGENT_TEMPLATES.find((template) => template.id === templateId)?.description}<ul>{AGENT_TEMPLATES.find((template) => template.id === templateId)?.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div> : <>
            <label>Agent name<input required minLength={1} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Research Assistant" /></label>
            <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value as Agent["department"])}><option value="development">Development</option><option value="sales">Sales</option><option value="operations">Operations</option></select></label>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-button" disabled={busy}>{busy ? "Creating…" : "Create agent"}</button>
        </form>
      </section>}
      {!canManage && error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
