-- Durable queue metadata. This migration does not start workers or execute tasks.
ALTER TABLE tasks
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by varchar(120),
  ADD COLUMN last_error text;

CREATE INDEX tasks_queue_ready_idx
  ON tasks (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX tasks_lease_recovery_idx
  ON tasks (locked_at)
  WHERE status = 'running';
