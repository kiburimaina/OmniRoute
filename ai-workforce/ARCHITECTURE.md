# AI Workforce — Architecture Blueprint

AI Workforce is a separate application that coordinates AI-powered development, sales, and business-operations teams. OmniRoute remains an external model gateway; this project must not modify or fork OmniRoute runtime behavior.

## Product departments

- **Development:** architecture, frontend, backend, database, QA, and security agents. Work is isolated in branches/worktrees; changes are reviewed and proposed through pull requests.
- **Sales:** website chat, lead qualification, product recommendations, customer follow-up, and human handoff. Voice and messaging channels are adapters, not separate business brains.
- **Operations:** customer support, CRM workflows, reporting, and approved business automations.

## High-level architecture

1. **Web control plane:** authenticated dashboard for organizations, projects, agents, tasks, conversations, approvals, and audit history.
2. **API/backend:** tenant-aware application API; validates identity, authorization, quotas, and approval requirements.
3. **Orchestrator:** durable task and conversation state machine. Assigns work, tracks timeouts/retries, routes handoffs, and records outputs.
4. **Agent runtime:** bounded tool execution with per-agent capabilities, budgets, and scoped credentials. Agents are not given unrestricted shell or production access.
5. **Model gateway adapter:** calls OmniRoute through its OpenAI-compatible API. Provider/model allowlists and hard spending limits are enforced by our backend, not trusted to model prompts.
6. **Business integrations:** GitHub, website chat, CRM, email, WhatsApp/SMS and telephony adapters. Each integration has explicit scopes and consent controls.
7. **Persistence:** relational database for tenants, users, projects, tasks, conversations, approvals, credentials metadata, and audit events; object storage for attachments/artifacts.

## Core boundaries

- OmniRoute is a dependency/service, not the orchestration database or control plane.
- Development agents and customer-facing sales agents use separate policies, tool registries, and data scopes.
- Customer data is tenant-isolated. A tenant's knowledge base and conversation history must never be visible to another tenant.
- Human approval is required for production deployments, repository merges, outbound campaigns, refunds, purchases, and other consequential actions.
- Secrets are stored only in a dedicated secret manager or encrypted credential store. Never commit credentials or expose them to model context.
- Free-tier labels do not guarantee zero cost. Default-deny paid models; enforce provider allowlists, request/token budgets, quota checks, and hard stops.

## Recommended initial stack

- TypeScript and Node.js for the backend and agent runtime, matching the existing ecosystem.
- Next.js App Router for the dashboard.
- PostgreSQL for durable multi-tenant application data.
- A durable job/workflow mechanism for retries, long-running tasks, and resumability.
- SSE or WebSockets for live task and conversation updates.
- OpenAI-compatible adapter for OmniRoute; local Ollama can be a development option.

Final library choices must be validated against hosting, budget, and operational requirements before implementation.

## Security baseline

- Authentication and role-based access control from the first milestone.
- Tenant-scoped authorization at every API/data boundary.
- Least-privilege integration tokens and short-lived execution credentials.
- Explicit approval gates for consequential actions.
- Immutable audit events for agent actions and approvals.
- Prompt-injection defenses: retrieved content is data, never authority to change policies or grant tools.
- Rate limits, per-tenant budgets, tool timeouts, bounded retries, and kill switches.
- Encryption in transit and at rest; redact secrets and sensitive customer data from logs.

## Phase 1 acceptance criteria

- Architecture and threat boundaries reviewed.
- Core domain entities and API boundaries documented.
- A vertical-slice plan is approved before implementation.
- No production credentials, paid provider usage, external messages, or deployments are enabled by default.
