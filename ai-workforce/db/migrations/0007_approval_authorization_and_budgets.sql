-- Bind consequential approvals to immutable action payloads and make them single-use.
ALTER TABLE approvals
  ADD COLUMN payload_hash char(64),
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN consumed_by_task uuid;

CREATE INDEX approvals_expiry_idx
  ON approvals (organization_id, expires_at)
  WHERE status = 'pending';

-- Hard budget controls. Missing budget rows mean spending is not authorised.
CREATE TABLE organization_spend_budgets (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  limit_micros bigint NOT NULL DEFAULT 0 CHECK (limit_micros >= 0),
  spent_micros bigint NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
  reserved_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (spent_micros + reserved_micros <= limit_micros)
);

CREATE TABLE spend_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid,
  provider varchar(80) NOT NULL,
  model varchar(120) NOT NULL,
  amount_micros bigint NOT NULL CHECK (amount_micros > 0),
  status varchar(16) NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','settled','released')),
  idempotency_key varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, task_id) REFERENCES tasks(organization_id, id)
);

CREATE INDEX spend_reservations_org_created_idx
  ON spend_reservations (organization_id, created_at DESC);

ALTER TABLE organization_spend_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_spend_budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY spend_budgets_tenant_isolation ON organization_spend_budgets
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE spend_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY spend_reservations_tenant_isolation ON spend_reservations
  USING (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.current_org_id', true), '')::uuid);

-- Deliberately do not seed budgets or enable provider execution. Operators must
-- explicitly configure a finite cap after reviewing pricing and controls.
