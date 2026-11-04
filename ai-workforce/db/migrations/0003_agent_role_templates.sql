-- Persist the role definition used to create an agent, independently of its execution policy.
ALTER TABLE agents
  ADD COLUMN template_id varchar(80),
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX agents_org_template_idx
  ON agents (organization_id, template_id)
  WHERE template_id IS NOT NULL;
