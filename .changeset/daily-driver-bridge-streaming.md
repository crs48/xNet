---
'@xnetjs/devkit': minor
'@xnetjs/cli': minor
---

The local agent bridge now streams Claude Code replies live and carries
conversations across turns. `cliStreamingChatAgent` drives Claude's
`stream-json` headless mode with partial deltas forwarded as they arrive,
the bridge maps conversations to CLI sessions (`--resume`) via transcript
fingerprints, timeouts are idle-based instead of a 120s wall-clock cap, and
chat turns run in a dedicated `~/.xnet/agent-home` working directory.
Workspace tools (`--mcp`) are on by default for the Claude agent
(`--no-mcp` opts out). New: `xnet bridge install` / `uninstall` manage a
macOS launchd login item with a stable pairing code, and `xnet doctor`
reports bridge daemon health.
