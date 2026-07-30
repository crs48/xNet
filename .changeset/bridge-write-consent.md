---
'@xnetjs/devkit': minor
'@xnetjs/cli': minor
---

Workspace writes from the bridged agent are now consent-gated. The devkit
exports a read-only MCP tool tier (`XNET_READONLY_ALLOWED_TOOLS`) and
`buildAgentArgs`/`buildStreamingAgentArgs` accept multiple allowed-tool
patterns; `xnet bridge serve` defaults the agent to read-only workspace
tools and requires `--allow-writes` to enable create/update/delete.
