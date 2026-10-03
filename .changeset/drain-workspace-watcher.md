---
'@xnetjs/plugins': minor
'@xnetjs/cli': patch
---

Add `AiWorkspaceWatcher.waitForIdle()` to finish active scans and asynchronous
callbacks after closing watch handles. Background failures stop the watch and
reject the drain. The agent daemon now drains before disposing storage on Ctrl-C,
so pending review writes and auto-applied edits cannot race database shutdown.
