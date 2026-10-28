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
