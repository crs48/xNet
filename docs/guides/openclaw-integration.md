# Driving xNet from OpenClaw (and other MCP agents)

xNet exposes its workspace as an **MCP substrate**: any MCP client — OpenClaw,
Claude Code, Codex, Cline, Goose — can read and safely mutate your tasks, pages,
and databases through one server. You build the connection once; it works for
every client ([exploration 0175](../explorations/0175_[_]_XNET_AS_A_SUBSTRATE_FOR_OPENCLAW.md)).

Every write flows through xNet's mutation-plan guardrail (risk, scopes,
approval, audit, rollback) regardless of which client is connected — so letting
an autonomous agent into your workspace is governed by xNet, not by the agent's
own (often weak) safety model.

## Start the server

xNet talks to its local API, so start that first (the desktop/CLI app exposes
it on `http://127.0.0.1:31415` by default), then:

```bash
# stdio — for clients that spawn the server (Claude Code, Codex, OpenClaw stdio)
xnet mcp serve

# hardened loopback HTTP — for browser / HTTP-only clients (OpenClaw streamable-http)
xnet mcp serve --http --allow-origin https://your-app.example --port 31416
```

The `--http` form prints the bound URL, a generated **pairing token**, and a
ready-to-paste OpenClaw config block.

## Configure OpenClaw

Add an entry to OpenClaw's `mcp.servers`. stdio is simplest and most secure
(process isolation, no network surface):

```jsonc
{
  "mcp": {
    "servers": {
      "xnet": {
        "command": "xnet",
        "args": ["mcp", "serve"],
        "transport": "stdio",
        // Least privilege: expose reads + safe writes, withhold destructive tools.
        "toolFilter": { "include": ["xnet_*"], "exclude": ["xnet_delete"] }
      }
    }
  }
}
```

For the HTTP transport (e.g. an Electron-hosted xNet), use the snippet printed by
`xnet mcp serve --http`:

```jsonc
{
  "mcp": {
    "servers": {
      "xnet": {
        "url": "http://127.0.0.1:31416/mcp",
        "transport": "streamable-http",
        "headers": { "x-xnet-pairing": "<token printed by the server>" }
      }
    }
  }
}
```

## Hardening OpenClaw

OpenClaw's defaults are permissive and it has a documented history of security
issues (a critical RCE, sandbox bypasses, prompt-injection exposure). Treat the
agent as untrusted and harden its host:

- **Don't bind it to the network.** Keep its gateway on loopback; never expose
  `0.0.0.0:18789`.
- **Run it sandboxed** (Docker), with least-privilege filesystem access:
  ```bash
  docker run -d --name openclaw --user openclaw --read-only --tmpfs /tmp \
    --cap-drop=ALL --security-opt=no-new-privileges -p 127.0.0.1:18789:18789 ...
  ```
- **Scope what xNet exposes** with `toolFilter` — exclude `xnet_delete` and any
  outward-facing tools unless you need them.
- **Keep the guardrail on.** xNet requires approval for medium+ risk and
  destructive/outward actions; never run a flow that bypasses it.
- **Vet skills.** ClawHub has had malicious skills; pin and review anything you
  install, including xNet's own ([skill](../integrations/openclaw/xnet-workspace-skill.md)).

## Why route through OpenClaw vs. Claude Code / Codex directly?

Choose **OpenClaw** for *ambient reach* — driving your workspace from WhatsApp /
Telegram / iMessage, on a schedule, with a local model. Choose **Claude Code /
Codex** for coding-grade capability, lower setup friction, and stronger
security. Because all of them speak MCP to the same xNet server, you pick per
use-case and xNet doesn't have to.

## See also

- [ClawHub skill](../integrations/openclaw/xnet-workspace-skill.md)
- [Connect a model](./connect-a-model.md)
- [xNet-as-substrate exploration](../explorations/0175_[_]_XNET_AS_A_SUBSTRATE_FOR_OPENCLAW.md)
