ALTER TABLE approvals
  ADD COLUMN requested_by uuid;
CREATE INDEX approvals_org_task_action_pending_idx
  ON approvals (organization_id, task_id, action)
  WHERE status = 'pending';
