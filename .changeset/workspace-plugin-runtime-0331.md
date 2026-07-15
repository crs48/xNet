---
'@xnetjs/plugins': minor
---

Add the workspace-plugin runtime (exploration 0331): author, hot-load, and
compose plugins whose source lives in the workspace as a `PluginSource` node.
New public surface: `PluginSourceSchema` + `readPluginSourceNode`, an in-browser
module builder (`buildPluginModuleGraph`) with a pinned import map, the
`SandboxedPluginHost` (`activateWorkspacePlugin`) that loads plugin code only in
an opaque-origin iframe and registers data-declared contributions over
MessagePort RPC, a gated store RPC (`createPluginStoreRpc`, denylist-wins), a
250ms-debounce hot reloader (`createWorkspacePluginHotReloader`), content-hash
pinning + drift diffing (`computePluginSourceHash`, `assessPluginUpdate`), the
`plugin_*` agent tools (`createWorkspacePluginAgentTools`) and the
`WRITING_XNET_PLUGINS_SKILL_MD` authoring skill, and both publish paths
(`requestWorkspacePluginPublish`, `buildCommunityRegistryEntry`). `MCPServerConfig`
gains an `extraTools` field to expose the new tools beside the built-ins.
