-- Durable, tenant-scoped action intents. This records authorization and dispatch state;
-- it does not register handlers or enable external execution.
CREATE TABLE action_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  action varchar(120) NOT NULL CHECK (action IN ('external_message','publish','purchase','deploy','repository_merge')),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  details jsonb NOT NULL CHECK (octet_length(details::text) <= 49152),
  idempotency_key varchar(160) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'authorized'
    CHECK (status IN ('authorized','running','succeeded','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  locked_by varchar(120),
  locked_at timestamptz,
  result_reference varchar(240),
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id),
  FOREIGN KEY (organization_id, approval_id) REFERENCES approvals(organization_id, id)
);

CREATE INDEX action_dispatches_ready_idx
  ON action_dispatches (created_at)
  WHERE status = 'authorized';
CREATE INDEX action_dispatches_lease_idx
  ON action_dispatches (locked_at)
  WHERE status = 'running';

ALTER TABLE action_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY action_dispatches_tenant_isolation ON action_dispatches
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

-- Expired running leases are moved to 'uncertain', never automatically retried:
-- the external side effect may have completed before the worker crashed.
