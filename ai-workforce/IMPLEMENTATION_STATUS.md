# Implementation Status

## Phase 1 — Architecture
- [x] Product departments, boundaries, security baseline, and roadmap documented.

## Phase 2 — Foundation (in progress)
- [x] Next.js/React/TypeScript application scaffold and command-centre dashboard.
- [x] Zod domain contracts for organizations, projects, tasks, and approvals.
- [x] Initial PostgreSQL schema and tenant-scoped RLS policies, forced for table owners.
- [x] PostgreSQL connection pool with bounded pool size and timeouts.
- [x] Better Auth self-hosted email/password configuration with UUID IDs and 12-hour sessions.
- [x] Better Auth route handler and browser client.
- [x] Sign-in and sign-up screens.
- [x] Authenticated organization listing and atomic organization creation/owner assignment.
- [x] First-workspace onboarding screen.
- [x] Separate authentication and business-data database connection strings.
- [x] Membership verification before transaction-local tenant context is set.
- [x] Tenant-scoped project and task list/create API routes.
- [x] Authenticated project/task workspace with live lists and create forms; project association is enforced by composite tenant foreign keys.
- [x] Tenant-scoped agent registry API; agents default to disabled and owner/admin enablement is audited without starting execution.
- [x] Human approval request/list/decision API; requests require active tasks, decisions are audited, and never auto-execute external actions.
- [x] Human approval review interface with owner/admin-only decision controls.
- [x] Same-origin checks for cookie-authenticated mutations and bounded 64 KiB JSON parsing.
- [x] Health endpoint and environment template.
- [x] API/authentication contract documented.
- [ ] Apply Better Auth schema migration in a configured database.
- [x] Protect dashboard with server-side session and workspace checks.
- [x] Add server-side session and organization-membership guards to agent and project/task workspace pages.
- [ ] Trusted email verification and password reset delivery.
- [ ] Distributed rate limiting and production CSRF review.
- [x] Database migration runner and documented operator setup procedure.
- [ ] Apply migrations to a provisioned environment and complete a reviewed release process.
- [x] Least-privilege PostgreSQL app-role setup runbook documented; role creation and grants remain an operator task.
- [x] PostgreSQL tenant-isolation integration tests added and wired into CI with an ephemeral database and restricted runtime role.
- [ ] Execute and verify the latest CI database job; latest known run passed typecheck and database tests but failed lint before the lint fixes. Sign-up/sign-in and full browser onboarding integration tests remain outstanding.
- [x] Sign-up/sign-in forms normalize email, handle network failures, and show account-creation confirmation.
- [x] Audit-event writes for project, task, and organization creation (same transaction as the mutation).
- [x] GitHub Actions typecheck/lint/build workflow configured; latest run must be checked before declaring green.

## Safety status

Authentication and onboarding code is committed, but the database schema migration has not been run and no live database is configured. Do not expose the dashboard publicly yet. No paid services, provider credentials, customer messaging, merges, or deployments have been enabled.
