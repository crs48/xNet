---
'@xnetjs/data': minor
'@xnetjs/storage': minor
---

Fix attachments over 1 MB failing to sync. Large files are stored as chunks behind a manifest, and the manifest's identifier is what the file reference carries — so uploading the reassembled file was rejected by the hub's content check, and every attachment above 1 MB silently failed to reach other devices. Transfers now send each stored blob under its own content hash, chunks before the manifest, and verify each one on the way back down.
