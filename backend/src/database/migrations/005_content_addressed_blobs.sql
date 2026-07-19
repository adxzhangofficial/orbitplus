-- Content-addressed version storage.
--
-- Every file version previously stored its own encrypted copy, so fifty saves
-- of a one megabyte file cost fifty megabytes even when the bytes repeated.
-- Payloads now live once per (organization, checksum) and versions reference
-- them, which makes repeated saves, rollbacks, and revert cycles nearly free.
--
-- The encryption AAD moves from (organization, server, path, checksum) to
-- (organization, checksum). Binding the path into the ciphertext is what forced
-- a rename to decrypt and re-encrypt every historical version, which is O(n)
-- crypto on a directory move. Path binding is preserved instead by
-- file_versions.row_signature, an HMAC over the row's identifying columns, so
-- rewriting a stored path is still detectable.

CREATE TABLE IF NOT EXISTS file_blobs (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  checksum text NOT NULL,
  content_ciphertext text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, checksum)
);

ALTER TABLE file_versions
  ADD COLUMN IF NOT EXISTS row_signature text;

-- The 003 constraint requires content_ciphertext to be present, which would
-- reject the conversion that clears it. Migration 006 replaces it with the
-- blob-backed equivalent once every row has moved.
ALTER TABLE file_versions
  DROP CONSTRAINT IF EXISTS file_versions_ciphertext_only;

-- Retention: versions are pruned per plan, so the sweep needs an ordered scan
-- per file rather than a full table scan.
CREATE INDEX IF NOT EXISTS file_versions_retention_idx
  ON file_versions(organization_id, server_id, path, version_number DESC);
CREATE INDEX IF NOT EXISTS file_versions_created_idx
  ON file_versions(organization_id, created_at);
