---
'@xnetjs/workbench': patch
---

Keep inline extension document drafts tied to their page and permission session.
Switching pages or tabs preserves independent drafts and pending saves, and no
longer carries one page's unsaved text into another page's editor. Keep the data
picker open while changing an active extension's permissions. Explain rejected
Undo operations without showing internal Electron errors.
