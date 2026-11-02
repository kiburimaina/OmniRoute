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
- [x] Tenant-scoped project and task list/create API routes, plus audited cancellation of eligible tasks.
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
- [x] Durable queue migration with retry limits, backoff scheduling, worker lease fields, and queue indexes.
- [x] Worker transaction helper applies transaction-local tenant RLS context for the full unit of work.
- [x] Agent execution preparation verifies task lease ownership, assigned-agent state, and a strict bounded policy schema.
- [x] Task creation can assign an enabled agent from the same organization; task lists display the assigned agent.
- [x] Execution budget checks cover steps, runtime, and output-token allowance; external tools remain unavailable until platform review.
- [x] Unit tests added for lease ownership, disabled agents, invalid policy, tool registry fail-closed behaviour, and budget enforcement.
- [x] Tenant-scoped queue primitives for SKIP LOCKED claims, lease-owned completion/failure, bounded exponential retries, lease heartbeats, and expired-lease recovery.
- [x] Authenticated internal worker claim, heartbeat, and result endpoints with constant-time bearer-secret validation and tenant allowlisting; model/tool execution remains disabled.
- [x] Authenticated lease-recovery endpoint iterates only server-configured organization UUIDs, with a bounded lease timeout and isolated RLS transaction per tenant; external scheduling remains an operator responsibility.
- [x] Department-specific Development, Sales, and Operations role templates with responsibilities and conservative default policies.
- [x] Persist template ID, description, and responsibilities on agent records through migration 0003; registry reads retain this metadata after toggling agents.
- [x] Agent registry UI can create template-based roles or custom roles; template-created agents remain disabled with no tools or model token allowance.
- [x] Unit tests cover department template coverage, template lookup, and safe policy defaults.
- [x] Structured department workflow catalogue with required inputs, output contracts, and approval action categories.
- [x] Task creation validates workflow-to-agent department compatibility and persists workflow context; worker claims return the workflow contract.
- [x] Backend approval requests accept only supported consequential action categories and validate them against the task workflow/agent policy.
- [x] Approval requests lock tasks, prevent duplicate pending requests, and record the requester; self-approval is blocked for owner/admin decisions.
- [x] Unit tests cover supported action categories, workflow policy matching, custom agent policy, and fail-closed unknown workflows.
- [x] Durable task execution attempt history, structured JSON results, lifecycle timestamps, and bounded error persistence.
- [x] Authenticated worker result endpoint enforces organization allowlist and active lease ownership for success/failure reports.
- [x] Expired lease recovery closes attempt history with `lease_expired` and applies bounded task retry policy.
- [x] Workspace task cards expose structured result, attempt counters, latest failure, and completion time; tenant-scoped attempt history API added.
- [x] CI and database role runbooks grant least-privilege access to the new execution-history table.
- [x] Workflow-specific structured output validation enforces every declared output section, rejects unexpected sections, and bounds stored output to 48 KiB.
- [x] Authenticated worker success reports validate the active task workflow contract before completing the task; invalid output returns HTTP 422 without completing the task.
- [x] Unit tests cover valid workflow output, missing/extra sections, empty content, and general task output.
- [x] Workspace task form supports selecting a workflow for the selected agent department; workflow contract unit tests added.
- [ ] Verify the latest CI run after the server-only dependency and approval-policy fixes. Sign-up/sign-in and full browser onboarding integration tests remain outstanding.
- [x] Sign-up/sign-in forms normalize email, handle network failures, and show account-creation confirmation.
- [x] Audit-event writes for project, task, and organization creation (same transaction as the mutation).
- [x] GitHub Actions typecheck/lint/build workflow configured; latest run must be checked before declaring green.

## Safety status

Authentication and onboarding code is committed, but the database schema migration has not been run and no live database is configured. Do not expose the dashboard publicly yet. No paid services, provider credentials, customer messaging, merges, or deployments have been enabled.
