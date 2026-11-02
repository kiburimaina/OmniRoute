# PostgreSQL application role setup

Run this as a database administrator against the dedicated AI Workforce database.
Do not run the application as the migration/database-owner role.

Create a login role with a strong password using your secret manager or an
interactive `psql` session. Never commit the password or put it in this file.

```sql
CREATE ROLE aw_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password aw_app

GRANT CONNECT ON DATABASE ai_workforce TO aw_app;
GRANT USAGE ON SCHEMA public TO aw_app;

-- Membership and workspace onboarding are currently handled by trusted API routes.
GRANT SELECT, INSERT ON TABLE organizations TO aw_app;
GRANT SELECT, INSERT ON TABLE organization_members TO aw_app;

-- Current API surface: projects, tasks, agent registry, approvals, and audit events.
GRANT SELECT, INSERT ON TABLE projects TO aw_app;
GRANT SELECT, INSERT, UPDATE ON TABLE tasks TO aw_app;
GRANT SELECT, INSERT, UPDATE ON TABLE agents TO aw_app;
GRANT SELECT, INSERT, UPDATE ON TABLE approvals TO aw_app;
GRANT INSERT ON TABLE audit_events TO aw_app;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO aw_app;
```

## Required operational safeguards

- Apply migrations as a separate migration owner, not `aw_app`.
- Ensure `aw_app` is not the owner of tenant tables and is not a member of a
  privileged role. It must not have `BYPASSRLS`.
- Keep `DATABASE_URL` restricted to the app role and store it in the hosting
  platform's secret manager.
- Use TLS with certificate verification in hosted environments
  (`DATABASE_SSL=true`).
- Review grants whenever a new API route or table is introduced. Do not grant
  blanket privileges to all tables.
- The migration role must create the schema and policies before the app role
  is used. The app role intentionally has no DDL permissions.
- The current API reads `organization_members` before setting
  `app.current_org_id`; the role therefore needs the narrowly scoped SELECT
  grant above. Do not expose membership queries directly to clients.

This is a manual DBA runbook, not an automatically executed migration. No
database credentials or roles are created by the application repository.


## Separate Better Auth database role

Better Auth connects through `AUTH_DATABASE_URL`, not the business API's `DATABASE_URL`.
Use a separate login role for the authentication tables. After running Better Auth's
schema migration as the migration owner, grant the auth role only the privileges it
needs on the four Better Auth tables:

```sql
CREATE ROLE aw_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
\password aw_auth
GRANT CONNECT ON DATABASE ai_workforce TO aw_auth;
GRANT USAGE ON SCHEMA public TO aw_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user", "session", "account", "verification" TO aw_auth;
```

If the Better Auth migration creates additional tables or plugins are enabled,
review the generated schema and grant only the required table privileges. Do not
grant this role access to tenant business tables. Store its connection string in
`AUTH_DATABASE_URL` using the hosting platform's secret manager.
