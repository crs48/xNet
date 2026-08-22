---
'@xnetjs/plugins': minor
'@xnetjs/react': patch
'@xnetjs/cli': patch
---

Plugin composition runtime (exploration 0455): new `EffectScope` (nested, reverse-order, awaited disposal — `ExtensionContext.scope` backs `subscriptions`, and deactivation now awaits teardown) and `ServiceRegistry` (`provide`/`get`/`watch`/`inject` with availability semantics). `AiSurfaceService` and the MCP server resolve `agent-tools` providers live from a registry, so plugin-, connector-, and workspace-plugin-contributed tools reach every host — a plugin activating mid-session adds its tools to `tools/list` without a restart. `xnet mcp serve` (and the desktop agent bridge) now expose the `plugin_*` workspace-plugin tools. Manifests gain validated optional `provides`/`inject` service-name declarations; `Disposable.dispose` may now return a promise.
