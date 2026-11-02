-- Durable execution history and structured task output.
ALTER TABLE tasks
  ADD COLUMN result jsonb,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz;

CREATE TABLE task_execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 10),
  worker_id varchar(120) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('running','succeeded','failed','lease_expired','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  output jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id),
  UNIQUE (organization_id, task_id, attempt_number)
);

CREATE INDEX task_attempts_org_task_idx
  ON task_execution_attempts (organization_id, task_id, attempt_number DESC);

ALTER TABLE task_execution_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_execution_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY task_attempts_tenant_isolation ON task_execution_attempts
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
