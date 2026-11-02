# API and Authentication Contract

## Authentication

The application uses self-hosted Better Auth with email/password sign-in. Better Auth stores users, sessions, accounts, and verification records in PostgreSQL through AUTH_DATABASE_URL. The auth connection is intentionally separate from DATABASE_URL so the identity subsystem does not require broad privileges on business tables.

Required environment:
- AUTH_DATABASE_URL — PostgreSQL connection for Better Auth tables.
- BETTER_AUTH_SECRET — random secret of at least 32 bytes; never commit it.
- BETTER_AUTH_URL — canonical application URL in deployed environments.
- APP_ORIGIN — exact trusted browser origin used by mutation endpoints.
- DATABASE_URL — least-privilege business-data connection.
- AUTH_DATABASE_SSL / DATABASE_SSL — set true with verified TLS in hosted environments.

Email/password registration requires a 12-character minimum password. Sessions expire after 12 hours and the cookie cache is short-lived. Account creation does not automatically create a workspace; the user completes onboarding after sign-in.

Better Auth schema must be created against AUTH_DATABASE_URL before first use:
`npx auth@latest migrate`
Run this from the ai-workforce directory in an environment where AUTH_DATABASE_URL and BETTER_AUTH_SECRET are configured. This migration is a deliberate operator action; it is not run by CI or application startup.

## Routes

- GET/POST /api/auth/[...all] — Better Auth handlers (sign-up, sign-in, sign-out, session).
- GET /api/organizations — list organizations for the authenticated user.
- POST /api/organizations — create an organization and assign the creator the owner role atomically.
- GET /api/health — service status and environment readiness flags; no secrets are returned.
- GET /api/projects?organizationId=<uuid> — list projects for a verified organization member.
- POST /api/projects — JSON: { organizationId, name, description }. Requires owner, admin, or operator.
- GET /api/tasks?organizationId=<uuid> — list up to 100 recent tasks for a verified member.
- POST /api/tasks — JSON: { organizationId, projectId, assignedAgentId, title, description }. Requires owner, admin, or operator; an assigned agent must be enabled and belong to the same organization.
- GET/POST/PATCH /api/agents — list/create agents and enable/disable registry entries. Creation and toggles require owner/admin; POST accepts either { organizationId, name, department } for a custom role or { organizationId, templateId } for a department template. New agents remain disabled.
- GET/POST/PATCH /api/approvals — list/request/decide approvals. Requests require owner/admin/operator; decisions require owner/admin and never execute the approved action.

## Tenant security

Organization IDs are untrusted input. The server verifies membership before setting transaction-local RLS context. Tenant-owned database access must go through withOrganization. SQL is parameterized. The authentication database connection is separate from the business-data pool.

POST business and onboarding routes require exact Origin validation, Fetch Metadata checks when present, and JSON bodies capped at 64 KiB. These are defense-in-depth controls and still require a production CSRF review and rate limiting.

## Database setup

1. Apply db/migrations/0001_initial.sql to a dedicated PostgreSQL database as the migration owner.
2. Run Better Auth's schema migration against AUTH_DATABASE_URL.
3. Provision separate least-privilege auth and business application roles using db/ROLE_SETUP.md.
4. Ensure the business app role does not own tenant tables and does not have BYPASSRLS.

## Production blockers

- Verify email before enabling sensitive account capabilities; configure a real email delivery provider.
- Add password reset and account recovery delivery/configuration.
- Add distributed rate limiting for authentication and application APIs.
- Add browser/API integration tests proving sign-up/sign-in and full workspace onboarding against PostgreSQL; tenant-isolation database tests are wired into CI.
- Add migration automation with explicit release approval.
- Add audit-event coverage for privileged actions.
- Add secure secret management, monitoring, backups, and restore tests.

## Durable task queue primitives

Migration `0002_durable_task_queue.sql` adds bounded retry metadata, availability timestamps, worker leases, and queue indexes. `src/lib/task-queue.ts` provides tenant-scoped `SKIP LOCKED` task claiming, lease-owned completion/failure, exponential retry delay, and expired-lease recovery. These are infrastructure primitives only: no worker loop, model call, or external tool execution is enabled. Call queue functions inside a transaction and only from a trusted worker identity with the appropriate organization context.

## Internal worker API

The internal worker endpoints require an Authorization: Bearer credential backed by WORKER_SHARED_SECRET (minimum 32 bytes) and a WORKER_ALLOWED_ORGANIZATIONS allowlist containing exact organization UUIDs. Configure a separate secret and allowlist per worker deployment; do not expose these values to browser clients.

- POST /api/internal/worker/claim — claims one eligible queued task using SKIP LOCKED, verifies the assigned enabled agent and returns its bounded policy. Requires { organizationId, workerId }.
- POST /api/internal/worker/tasks/:taskId/heartbeat — renews a lease only when the task is still running and owned by the same worker.
- POST /api/internal/worker/tasks/:taskId/result — reports succeeded/failed for a task lease owned by the same worker. Failed tasks are retried with bounded backoff until max_attempts is reached.

Both endpoints run in tenant-scoped transactions and write audit events. Worker identities are currently deployment-level shared-secret identities, not individually provisioned credentials. Rotate the secret on compromise. No model provider or external tool is invoked; the returned execution plan explicitly reports both capabilities disabled. A separate authenticated worker process, per-worker credentials, distributed rate limiting, and operational lease scheduling are still required before production.

## Department role templates

The agent registry includes starter roles for Development (Solution Architect, Frontend Engineer, Backend Engineer, QA Engineer), Sales (AI Receptionist, Sales Consultant, Customer Support), and Operations (Operations Coordinator, Business Analyst). Templates define responsibilities and a conservative execution policy. All start disabled, have zero model-output token allowance, and have no enabled tools. Template creation persists the template identifier, description, responsibilities, and conservative execution policy on the agent record. Migration `0003_agent_role_templates.sql` adds the role metadata columns. Template creation only creates a registry record; it does not start execution.

## Department workflows

Tasks may optionally include `workflowId` and `workflowInput`. The API validates that the workflow exists, an enabled agent is assigned, and the workflow department matches that agent. Workflow IDs and structured inputs are stored with the task by migration `0004_department_workflows.sql`. The worker claim response includes the validated workflow definition and inputs. The initial workflow catalogue covers feature implementation planning, QA review, lead qualification, product consultation, daily operations review, and SOP drafting. These definitions are task contracts only: they do not enable model calls, send messages, publish content, merge code, or perform purchases. Consequential action approval remains a separate human-controlled workflow.

## Approval enforcement

Approval requests accept only the supported consequential action categories: `external_message`, `publish`, `purchase`, `deploy`, and `repository_merge`. The API reads the task workflow and assigned agent policy inside the tenant transaction, rejects actions that are not required by that policy, locks the task row, and prevents duplicate pending requests for the same task/action. Migration `0005_approval_requester.sql` records the requester. Owner/admin decisions are rejected when the deciding user is also the requester. An approval decision only updates approval/task state and writes an audit event; it never executes the approved action. Actual action execution remains unimplemented and disabled.

## Worker execution results and attempt history

The authenticated internal worker result endpoint accepts either a structured success result (`summary` plus JSON `data`) or a bounded failure message. It verifies the worker bearer secret and organization allowlist, then updates the task only when the worker owns the active lease. Each claim creates a durable attempt row; success and failure close that attempt. Expired-lease recovery marks the attempt as `lease_expired` and requeues or permanently fails the task according to its bounded retry policy. Task list responses include result, latest error, attempt counters, and lifecycle timestamps. `GET /api/tasks/attempts?organizationId=...&taskId=...` returns tenant-scoped attempt history. Migration `0006_execution_history.sql` creates the attempt table and structured task result fields.

This is execution lifecycle infrastructure, not an enabled AI agent. Model/provider execution and external tools remain disabled. A trusted worker may report a result only for a task lease it owns; the platform does not claim that an AI model actually produced that result.
