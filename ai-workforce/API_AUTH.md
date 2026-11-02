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
- POST /api/tasks — JSON: { organizationId, projectId, title, description }. Requires owner, admin, or operator.

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
- Add integration tests proving sign-up/sign-in and cross-tenant isolation against PostgreSQL.
- Add migration automation with explicit release approval.
- Add audit-event coverage for privileged actions.
- Add secure secret management, monitoring, backups, and restore tests.
