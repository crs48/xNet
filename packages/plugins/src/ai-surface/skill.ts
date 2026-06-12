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

- Find things: Grep this checkout first; \`xnet search "<text>"\` for ranked
  results (TSV: id, slug, title, snippet).
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
  script with an \`api\` object (\`api.nodes(schema)\`, \`api.search(text)\`,
  \`api.proposeUpdate(id, props)\`, \`api.proposeCreate(schema, props)\`).
  Writes are proposals that flow through the same plan pipeline. Return a
  digest, not raw rows.
`
