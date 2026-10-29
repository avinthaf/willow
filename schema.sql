CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  agent       text,
  project     text,
  session_id  text,
  kind        text,
  content     text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}',
  embedding   vector(1536)
);

ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model text;

CREATE INDEX IF NOT EXISTS memories_created_at_idx ON memories (created_at);
CREATE INDEX IF NOT EXISTS memories_meta_idx ON memories USING gin (meta);

-- Staleness handling. Agents may supersede or flag. Only a human deletes.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by bigint REFERENCES memories (id);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS review_after date;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS flag_reason text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS flagged_at timestamptz;
DO $$ BEGIN
  ALTER TABLE memories ADD CONSTRAINT memories_status_check
    CHECK (status IN ('active', 'superseded', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS memories_status_idx ON memories (status);
