CREATE TABLE IF NOT EXISTS "events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "offset" bigint NOT NULL UNIQUE,
  "event_type" text NOT NULL,
  "resource_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "events_offset_idx" ON "events" ("offset");
CREATE INDEX IF NOT EXISTS "events_resource_id_idx" ON "events" ("resource_id");
