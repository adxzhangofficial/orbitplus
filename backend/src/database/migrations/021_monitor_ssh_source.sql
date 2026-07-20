-- Metrics read over SSH are a third source, distinct from the other two.
--
-- 'probe' means only reachability was measured, which is all SFTP alone can
-- tell you. 'ssh' means CPU, memory, and disk were read from the host over the
-- connection already open for file transfer. 'agent' means the host pushed
-- them itself.
--
-- Keeping them apart matters because they answer with different confidence: an
-- agent reading keeps arriving when the network to the host is broken, and an
-- SSH reading does not.
ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_source_check;
ALTER TABLE monitors
  ADD CONSTRAINT monitors_source_check
  CHECK (source IN ('probe', 'ssh', 'agent'));
