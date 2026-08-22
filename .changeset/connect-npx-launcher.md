---
'@xnetjs/cli': patch
---

`xnet connect` now registers an `npx -y @xnetjs/cli` MCP server launcher when the `xnet` bin is not on PATH, so the zero-install `npx @xnetjs/cli connect claude-code` on-ramp produces a registration that still works after the npx cache is gone.
