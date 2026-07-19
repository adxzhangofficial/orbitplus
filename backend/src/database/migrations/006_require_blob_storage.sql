-- Migration 005's application hook has moved every payload into file_blobs and
-- signed every version row. Enforce blob-only storage from here on: a version
-- carries identity and a signature, never its own copy of the bytes.
ALTER TABLE file_versions
  DROP CONSTRAINT IF EXISTS file_versions_ciphertext_only;

ALTER TABLE file_versions
  ADD CONSTRAINT file_versions_blob_backed
  CHECK (content IS NULL AND content_ciphertext IS NULL AND row_signature IS NOT NULL);
