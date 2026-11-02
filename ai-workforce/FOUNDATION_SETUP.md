# Foundation operator setup

This checklist is the handoff from committed application code to a configured, testable foundation. It is intentionally not automated: database provisioning, credentials, and public exposure require an operator.

## 1. Provision two PostgreSQL connection roles

Use a dedicated PostgreSQL database for AI Workforce.

- A migration-owner connection runs the checked-in SQL migration and Better Auth's generated schema migration.
- `DATABASE_URL` uses the restricted `aw_app` role described in [ROLE_SETUP.md](./db/ROLE_SETUP.md).
- `AUTH_DATABASE_URL` uses the separate `aw_auth` role and must not grant access to business tables.
- Require TLS with certificate verification in hosted environments.

Do not use a superuser, table owner, or migration-owner URL as either runtime connection.

## 2. Apply database schemas

From the `ai-workforce` directory, apply the business schema as the migration owner:

```sh
npm install
npm run migrate
```

Then run Better Auth's schema migration as a deliberate operator action against `AUTH_DATABASE_URL` using the Better Auth CLI/version documented for the installed package. Review the generated schema before granting `aw_auth` its table privileges. Do not run either migration from application startup.

## 3. Configure runtime environment

Copy `.env.example` to a private environment file and configure:

- `DATABASE_URL` and `DATABASE_SSL=true` for the business database.
- `AUTH_DATABASE_URL` and `AUTH_DATABASE_SSL=true` for the auth database.
- `BETTER_AUTH_SECRET` with at least 32 bytes of cryptographically random secret material.
- `BETTER_AUTH_URL`, `APP_ORIGIN`, and `NEXT_PUBLIC_APP_URL` with the exact deployed origin.
- Keep OmniRoute settings unset until an explicit model-gateway integration milestone is approved.

Never commit real secrets or paste them into issues, logs, or source files.

## 4. Verify before exposing the app

1. Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.
2. Check `/api/health`; both database and authentication readiness must be configured.
3. Create a test account, sign in, create a workspace, and verify owner membership.
4. Create a project, task, agent, and approval; confirm audit records are written.
5. Verify viewer/operator/admin permissions and cross-tenant isolation with two separate workspaces.
6. Verify an agent remains disabled until an owner/admin explicitly enables its registry entry.
7. Confirm approval decisions only change stored state; they must not trigger a deployment, send a message, call a paid model, or execute an external action.

## 5. Current intentional limits

- No agent worker or model-provider execution is active.
- No email verification or password-reset delivery provider is configured.
- No production domain, database, secrets, or deployment is configured by this repository.
- No customer-facing outbound messaging, telephony, billing, or paid model usage is enabled.
- Keep the project on its isolated feature branch until a separate repository is created and the user explicitly approves any move, merge, or deployment.

The foundation is code-complete only after the operator steps and automated integration checks are completed. A successful build alone is not a production-readiness signal.
