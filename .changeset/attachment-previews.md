---
'@xnetjs/data': minor
'@xnetjs/views': minor
'@xnetjs/devtools': patch
---

Richer attachment previews. Images and video get a small preview generated when they are attached, stored alongside the file and synced ahead of it, so cells show a thumbnail before the full file arrives. The lightbox now plays video and audio inline and displays PDFs in the browser's viewer. `FileRef` gained optional `width`, `height`, and `thumbCid` fields, and the SQLite devtools panel reports how much space attachments are using.
