# AI Workforce — Delivery Roadmap

## Phase 1 — Foundation and architecture
- Confirm product boundaries, tenancy model, threat model, and deployment assumptions.
- Define domain entities, API contracts, agent/tool permissions, and approval states.
- Select the database, workflow engine, authentication, and hosting based on cost and operational constraints.
- Deliverable: reviewed architecture and implementation-ready technical specification.

## Phase 2 — Core platform
- Create the standalone application skeleton.
- Add authentication, organizations/workspaces, role-based access, and tenant isolation.
- Add PostgreSQL schema and migrations.
- Build dashboard shell, project/task records, audit events, and configuration management.
- Deliverable: secure control plane with no autonomous external actions.

## Phase 3 — Orchestration runtime
- Implement durable task state, queues/workflows, retries, cancellation, and event streaming.
- Add agent definitions, bounded tool registry, per-agent permissions, and execution budgets.
- Integrate OmniRoute behind a model-provider adapter.
- Add model allowlists and hard-stop cost controls.
- Deliverable: one supervised agent can complete a bounded task and report evidence.

## Phase 4 — Development department
- Add Architect, Frontend, Backend, Database, QA, and Security roles.
- Integrate GitHub with minimum scopes and isolated branches/worktrees.
- Generate patches and pull requests; require human approval before merge/deploy.
- Deliverable: supervised software task from issue to reviewed PR.

## Phase 5 — Text sales department
- Add tenant-owned product catalogue, knowledge base, lead and conversation records.
- Add website chat widget, sales/support agent workflows, escalation, and human takeover.
- Add consent-aware follow-up scheduling and suppression controls.
- Deliverable: website chat sales assistant with auditable handoff.

## Phase 6 — Messaging channels
- Add WhatsApp/SMS/email adapters only after provider policy, consent, templates, and opt-out handling are implemented.
- Add delivery webhooks, retries, rate limits, and channel-specific audit trails.
- Deliverable: approved outbound and inbound messaging.

## Phase 7 — Voice department
- Add speech-to-text, text-to-speech, telephony adapter, call state, and human transfer.
- Start with inbound calls; add outbound calling only with lawful consent and operational safeguards.
- Deliverable: voice agent sharing the same approved sales knowledge and CRM.

## Phase 8 — Operations and analytics
- Add CRM workflows, reporting, quality review, agent performance, and business automations.
- Require approval for refunds, payments, purchases, and other high-impact actions.
- Deliverable: business operations dashboard.

## Phase 9 — Production hardening
- Threat modeling, penetration testing, privacy review, backups/restore drills, observability, incident response, and load testing.
- Configure production secrets and billing limits; verify all kill switches.
- Deploy with rollback and staged rollout.
- Deliverable: production release checklist signed off by the owner.

## Global release gates
- No secrets committed to Git.
- No paid model/provider enabled without explicit owner approval.
- No production deployment or destructive action without explicit approval.
- No customer message/call campaign without consent and opt-out controls.
- Every agent tool call is authorized, bounded, and audited.
