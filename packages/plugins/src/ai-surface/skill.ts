/**
 * The xNet agent skill: a single cross-harness SKILL.md (Claude Code, Codex,
 * Gemini CLI, Cursor) describing the vault checkout and the xnet CLI.
 *
 * This is the primary agent interface contract. Keep it stable between
 * releases (prompt caching) and under the token budget guarded by
 * agent-token-budget tests (~1k tokens).
 */

export const XNET_AGENT_SKILL_MD = `---
name: xnet
description: Read, search, and edit the user's xNet workspace (pages, databases, canvases) via vault files and the xnet CLI.
---

# Working with xNet

This folder is a checkout of the user's xNet workspace. The xNet database
stays the source of truth; these files are a working tree. Identity lives in
frontmatter and the manifest, never in filenames.

## Lanes (cheapest first)

Pick by the shape of the question. The same 15 tasks cost ~2.7k tokens through
the CLI and ~18k through MCP; on aggregate questions the CLI lane is 20× cheaper.

1. **Code** — \`xnet run <script.js>\` for anything aggregate: counting,
   grouping, cross-referencing, bulk edits. Compute there, return a **digest**.
   Reading 60 rows into context to count three statuses is the most expensive
   mistake available here.
2. **CLI** — \`xnet search\`/\`recall\`/\`query\`/\`db get\` print plain stdout;
   grep and pipe them. Use \`recall\` when the answer spans nodes.
3. **Vault** — Grep/Read/Edit these files, then \`xnet commit\`.
4. **MCP** — fallback for shell-less clients; the CLI is cheaper.

**Check the tier line.** \`search\` and \`recall\` lead with
\`tier <hybrid-graph|bm25-graph|bm25|scan>\`. \`scan\` means no full-text index
and only a bounded window matched by substring — **never conclude something
does not exist from a \`scan\`.** Running many verbs? \`xnet serve\` keeps one
warm process for all of them.

Reads are free; **writes are deliberate**. Edits become validated mutation
plans that only persist on \`xnet commit --apply\`; the MCP server is read-only
unless it was connected with \`--writes\`. Scope every \`checkout\` (\`--query\`,
\`--schema\`, \`--node\`, \`--kind\`) — never materialize the whole workspace.

## Layout

- \`Pages/<slug>.md\` — pages as Markdown with YAML frontmatter
  (\`xnet.id\`, \`xnet.revision\`). Never edit frontmatter.
- \`Databases/<slug>.schema.json\` + \`<slug>.rows.jsonl\` — one JSON object
  per line; edit, append, or remove lines to change rows.
  \`<slug>.tsv\` sidecars are read-only fast reads.
- \`Canvases/<slug>.canvas\` — JSON Canvas projections.
- Wikilinks \`[[Title]]\`, \`:::xnet-database\` blocks, and
  \`{{xnet-ref ...}}\` directives are live references — preserve them.

## Workflow

- Find things: Grep this checkout first; \`xnet search "<text>"\` when you know
  roughly what the node is called (TSV: id, schemaId, title, snippet).
- Answer questions: \`xnet recall "<question>"\` when the answer spans nodes
  ("how is Acme tied to the Q2 emails?"). TSV: id, title, path, snippet, then
  an \`expandable\` line of ids dropped for budget — fetch those with
  \`xnet db get <id>\` only if you need them.
- Need more data? \`xnet checkout --query "<text>"\` (or \`--schema <iri>\`,
  \`--kind page|database|canvas\`, \`--node <id>\`) materializes a scoped
  slice into this folder. Never export everything.
- Query tables: \`xnet query <database> --where field=value --format tsv\`
  (default TSV; \`--format jsonl|json\` when you need structure).
- File edits become validated mutation plans. With \`xnet daemon\` running
  they are picked up automatically; otherwise run \`xnet commit\`.
- \`xnet status\` lists pending plans and conflicts. Conflicts are quarantined
  in \`.xnet/conflicts/\` with a Markdown note explaining how to resolve;
  fix the file and save again. Stale edits never silently overwrite.
- Bulk or aggregate work: \`xnet run <script.js>\` executes a sandboxed
  script. The file is one expression — \`(node, ctx) => { … }\` — and \`api\`
  is in scope: \`api.nodes(schema)\`, \`api.search(text)\`,
  \`api.recall(query)\`, \`api.graph(nodeId, hops)\`,
  \`api.proposeUpdate(id, props)\`, \`api.proposeCreate(schema, props)\`.
  Writes are proposals that flow through the same plan pipeline. Return a
  digest, not raw rows. \`recall\`/\`graph\` reach past the loaded slice; they
  are synchronous, so the host runs your script twice (once to see what you
  ask for, once with the answers) — keep those queries deterministic, or the
  second pass throws.
`
