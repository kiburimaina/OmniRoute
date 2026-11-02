# API and Authentication Contract

## Session

The API accepts a signed JWT in the HttpOnly cookie named `aw_session`. Required claims are `sub` (user UUID), `iss` (AUTH_ISSUER), `aud` (AUTH_AUDIENCE), and `exp`. Only HS256 is accepted. Keep AUTH_SECRET private and use short session lifetimes.

The app does not yet include login, registration, password reset, OAuth callbacks, or a token-issuing endpoint. Until a trusted session issuer is integrated, project and task endpoints fail closed with 401. Production cookies must be HttpOnly, Secure, SameSite=Lax or stricter. Add CSRF protection before enabling cookie-authenticated state changes.

## Endpoints

- GET /api/health — service status and environment readiness flags; no secrets are returned.
- GET /api/projects?organizationId=<uuid> — list projects for a verified organization member.
- POST /api/projects — JSON: { organizationId, name, description }. Requires owner, admin, or operator.
- GET /api/tasks?organizationId=<uuid> — list up to 100 recent tasks for a verified member.
- POST /api/tasks — JSON: { organizationId, projectId, title, description }. Requires owner, admin, or operator.

Organization IDs are untrusted input. The server verifies membership before setting transaction-local RLS context. Tenant-owned database access must go through withOrganization. SQL is parameterized.

## Database setup

Apply db/migrations/0001_initial.sql to a dedicated PostgreSQL database. The application role must not own tenant tables and must not have BYPASSRLS. Grant only required privileges. The server membership lookup requires SELECT on organization_members.

## Production blockers

- Integrate a real identity provider and trusted session issuer.
- Add CSRF protection, login/logout, and session rotation.
- Add rate limiting and request-size limits.
- Add migration tooling and least-privilege database role provisioning.
- Add integration tests proving cross-tenant access is denied.
- Add audit-event writes for privileged actions.
- Add secure secret management, monitoring, backups, and restore tests.
