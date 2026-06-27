---
'@xnetjs/runtime': minor
---

Add `runAdapterConformance(makeClient)` — the executable "use xNet from any
framework" contract. It validates the reactive data binding (immediate live-query
snapshot then updates on mutate, no delivery after unsubscribe, one-shot fetch
round-trip, authorization denial surfaces, idempotent `destroy()`) once,
framework-agnostically, so a Vue/Svelte/Solid adapter only needs a thin
render-harness test on top. Exported alongside `AdapterConformanceError` and the
`ConformanceClientFactory` / `AdapterConformanceCheck` / `AdapterConformanceResult`
types.
