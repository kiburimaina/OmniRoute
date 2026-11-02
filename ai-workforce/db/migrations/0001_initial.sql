-- Initial tenant-scoped schema. Apply only to a dedicated AI Workforce PostgreSQL database.
-- The API must set app.current_org_id from a verified membership on every transaction.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role varchar(24) NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  department varchar(32) NOT NULL CHECK (department IN ('development','sales','operations')),
  enabled boolean NOT NULL DEFAULT false,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid,
  assigned_agent_id uuid,
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
  FOREIGN KEY (organization_id, assigned_agent_id) REFERENCES agents(organization_id, id)
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  action varchar(120) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('user','agent','system')),
  action varchar(120) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id varchar(120),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_org_created_idx ON projects(organization_id, created_at DESC);
CREATE INDEX tasks_org_status_created_idx ON tasks(organization_id, status, created_at DESC);
CREATE INDEX approvals_org_status_idx ON approvals(organization_id, status, requested_at DESC);
CREATE INDEX audit_events_org_created_idx ON audit_events(organization_id, created_at DESC);

-- Row-level security is defense in depth. The application must set the organization
-- context only after authenticating the user and verifying organization_membership.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_tenant_isolation ON projects
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY agents_tenant_isolation ON agents
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY tasks_tenant_isolation ON tasks
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY approvals_tenant_isolation ON approvals
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

-- Do not grant the application role BYPASSRLS or table ownership. Organization
-- membership reads should be mediated by a trusted authentication service.
