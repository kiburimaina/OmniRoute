# Implementation Status

## Phase 1 — Architecture
- [x] Product departments, boundaries, security baseline, and roadmap documented.

## Phase 2 — Foundation (in progress)
- [x] Next.js/React/TypeScript application scaffold and command-centre dashboard.
- [x] Zod domain contracts for organizations, projects, tasks, and approvals.
- [x] Initial PostgreSQL schema and tenant-scoped RLS policies.
- [x] PostgreSQL connection pool with bounded pool size and timeouts.
- [x] JWT cookie verification with fixed HS256 algorithm, issuer, audience, UUID subject, and minimum 32-byte secret validation.
- [x] Membership verification before transaction-local tenant context is set.
- [x] Tenant-scoped project and task list/create API routes.
- [x] Same-origin checks for cookie-authenticated mutations and bounded 64 KiB JSON parsing.
- [x] Health endpoint and environment template.
- [x] API/authentication contract documented.
- [ ] Trusted identity provider and login/session issuance.
- [x] Basic CSRF defense (Origin + Fetch Metadata) and bounded JSON request bodies.
- [ ] Distributed rate limiting and production CSRF review.
- [ ] Database migration runner.
- [x] Least-privilege PostgreSQL app-role setup runbook documented; role creation and grants remain a DBA task.
- [ ] Automated integration tests, including cross-tenant isolation.
- [x] Audit-event writes for project and task creation (same transaction as the mutation).
- [x] GitHub Actions typecheck/lint/build workflow configured; execution result pending.

## Safety status

The APIs fail closed when no valid session is present. No login/token-issuing service is implemented yet. The dashboard remains a preview and must not be exposed publicly as a finished product. Before production, configure a trusted identity provider, CSRF defenses, database grants, migration execution, and automated tenant-isolation tests.

No OmniRoute provider credentials, paid model calls, customer messaging, merges, or deployments have been enabled.
