---
'@xnetjs/data': minor
---

Add the `DebugReport` schema (`DebugReportSchema`, `type DebugReport`) for
first-party crash/debug-report triage nodes (exploration 0315). Reports carry
code-level diagnostics only, group by fingerprint, and inherit access from their
diagnostics Space via the standard space cascade.
