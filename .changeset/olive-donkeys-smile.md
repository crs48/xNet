---
'@xnetjs/devkit': minor
---

Add `mcpHttpConfigFor` for pointing a coding agent at an already-running MCP
server over Streamable HTTP, alongside the existing `mcpConfigFor` for servers
the agent spawns itself. This is how a host application hands the agent its
tools without shipping a CLI for it to launch: the app serves the workspace from
its own process and passes the URL plus a pairing header.
