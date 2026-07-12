---
'@xnetjs/core': minor
'@xnetjs/runtime': patch
'@xnetjs/plugins': patch
'@xnetjs/data': patch
---

New `@xnetjs/core` utilities (exploration 0300 — Effect Tier 0): a
dependency-free `RetryPolicy` vocabulary (`fixed`, `exponential`, `capped`,
`jittered`, `limitAttempts`), a `TaggedError` base class with `isTagged`
guard for string-discriminant errors, and a `singleFlight` promise-dedupe
helper.

Internal refactors onto them (no behavior change): both sync reconnect
loops (`@xnetjs/runtime`) now share one scheduler with their existing
backoff schedules preserved; the webhook emitter (`@xnetjs/plugins`) uses
the shared exponential policy; the schema registry and sqlite adapter
diagnostics memo (`@xnetjs/data`) use `singleFlight`. `NodeRelayError` and
`PermissionError` now extend `TaggedError` — `instanceof`, `.name`, and
`.code` matching are unchanged.
