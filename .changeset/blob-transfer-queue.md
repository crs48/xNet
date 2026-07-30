---
'@xnetjs/data': minor
'@xnetjs/editor': minor
'@xnetjs/views': minor
---

Database attachments now sync between devices. Previously a file cell synced its reference but not the bytes, so teammates saw an attachment that could never open. Uploads are now sent to the hub in the background after attaching, and peers fetch the bytes on first view — verified against the content hash before being stored. Files that cannot be fetched say "on another device" instead of rendering blank. Workspaces without a hub keep working exactly as before.
