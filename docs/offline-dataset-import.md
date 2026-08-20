# Offline dataset import guidance

Offline imports should be treated as local events until the sync layer has accepted them. Keep the source filename, content hash, schema version, and import timestamp with each record so retries remain idempotent.

When the same logical record exists locally and remotely, prefer an explicit conflict state over a silent last-write-wins replacement. A useful operator view shows the local value, remote value, and the rule that would resolve the conflict.
