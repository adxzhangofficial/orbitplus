-- Ciphertext is produced by the application so the encryption key never enters SQL.
-- migrate.ts backfills every legacy row inside the same transaction before this
-- migration is recorded as applied.
ALTER TABLE file_versions
  ADD COLUMN IF NOT EXISTS content_ciphertext text;

ALTER TABLE file_versions
  ALTER COLUMN content DROP NOT NULL;
