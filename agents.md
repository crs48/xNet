# xNet, for the agent reading this

You are (or are about to be) connected to a user's **xNet workspace**: their
documents, databases, and canvases, stored locally on their device in a
SQLite-backed, CRDT-synced store. The store is the source of truth. Every
write is signed and lands in a hash-chained change log the user can audit —
including yours.

## How you were (or will be) connected

```
npx @xnetjs/cli connect claude-code    # or: connect codex
```

That command installed a ~500-token `SKILL.md` (the full workflow contract),
registered the xNet MCP server as a fallback lane, and wrote a short section
into `CLAUDE.md` / `AGENTS.md`. It is idempotent and read-only by default;
write access exists only if your human passed `--writes`.

## The three lanes, cheapest first

1. **CLI.** `xnet search "<text>"`, `xnet query <db> --where field=value`,
   `xnet db get <id>` — plain TSV/stdout you can grep and pipe. Reach here
   first; it costs far fewer tokens than tool schemas.
2. **Vault checkout.** `xnet checkout --query "<text>"` materializes a
   _scoped_ slice of the workspace as Markdown + JSONL files. Read and Edit
   them like any files, then `xnet commit` turns your edits into
   schema-validated mutation plans. Never check out the whole workspace.
3. **MCP.** The registered `xnet` server, for when you have no shell. Slim by
   design; read-only unless connected with `--writes`.

## The safety contract (structural, not policy)

- **You cannot corrupt the store.** Every write path — file edit, CLI, MCP —
  funnels through the same plan → validate → apply core. Malformed or
  stale writes are quarantined as conflict notes in `.xnet/conflicts/`, never
  silently applied.
- **You sign as yourself.** Writes require an enrolled agent passport or an
  explicit key. The CLI refuses to persist a write under a throwaway
  identity.
- **Everything you do is auditable.** Your changes land in the signed change
  log next to everyone else's. The user can verify what you did without
  trusting you — behave accordingly.

## Key CLI verbs

| Command                       | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `xnet checkout`               | Materialize / extend a scoped checkout      |
| `xnet status`                 | Pending plans and conflicts                 |
| `xnet commit [--apply]`       | Turn file edits into applied mutations      |
| `xnet search "<text>"`        | Ranked full-text search                     |
| `xnet query <db> --where f=v` | Query tables (TSV default)                  |
| `xnet db get/set`             | Single-cell reads and writes                |
| `xnet run <script.js>`        | Sandboxed bulk work, write _proposals_ only |
| `xnet skill`                  | Print the SKILL.md contract                 |

## Read more

- Full docs, one file: https://xnet.fyi/llms-full.txt
- Connect guide: https://xnet.fyi/docs/guides/coding-agents/
- Agent interfaces (checkout layout, benchmark methodology):
  https://xnet.fyi/docs/guides/agent-interfaces/
- Building _apps_ on xNet instead? https://xnet.fyi/docs/ai/understanding-xnet/
