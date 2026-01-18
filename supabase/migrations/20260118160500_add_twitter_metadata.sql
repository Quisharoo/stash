-- Migration to add source_id and prevent duplicate syncs
ALTER TABLE saves ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE saves ADD COLUMN IF NOT EXISTS author_handle TEXT;
ALTER TABLE saves ADD COLUMN IF NOT EXISTS author_image_url TEXT;

-- Create unique index to prevent duplicate saves from the same source (e.g. same Tweet ID)
CREATE UNIQUE INDEX IF NOT EXISTS saves_source_id_idx ON saves (user_id, source_id) WHERE source_id IS NOT NULL;
