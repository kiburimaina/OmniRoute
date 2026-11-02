ALTER TABLE tasks
  ADD COLUMN workflow_id varchar(80),
  ADD COLUMN workflow_input jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX tasks_org_workflow_idx
  ON tasks (organization_id, workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;
