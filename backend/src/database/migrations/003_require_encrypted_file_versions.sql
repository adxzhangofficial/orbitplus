-- The prior migration's application hook has encrypted and cleared all legacy
-- plaintext. Enforce ciphertext-only storage for every future file version.
ALTER TABLE file_versions
  DROP CONSTRAINT IF EXISTS file_versions_ciphertext_only;

ALTER TABLE file_versions
  ADD CONSTRAINT file_versions_ciphertext_only
  CHECK (content IS NULL AND content_ciphertext IS NOT NULL);
