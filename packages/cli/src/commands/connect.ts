/**
 * `xnet connect <harness>` — make a coding agent a first-class xNet client in
 * one step (exploration 0393).
 *
 * The three access lanes (CLI verbs, the vault checkout, the MCP server) all
 * shipped already; what was missing was the on-ramp. This command installs the
 * skill, registers the MCP server as the fallback lane, optionally bootstraps a
 * vault, and self-checks — idempotently, printing a diff of what it changed.
 *
 * Harnesses:
 * - `claude-code` — skill to `.claude/skills/xnet/SKILL.md` (or `~/.claude/...`
 *   with `--user`), MCP to `.mcp.json`, instructions to `CLAUDE.md`.
 * - `codex`       — instructions to `AGENTS.md` (Codex co-authored the spec),
 *   MCP to `.codex/config.toml`.
 *
 * Read-only by default; `--writes` registers the server with write access. The
 * primary lane is always the CLI + vault (token-cheap); MCP is the fallback for
 * shell-less clients.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { XNET_AGENT_SKILL_MD } from '@xnetjs/plugins/node'
import { Command } from 'commander'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

export type ConnectHarness = 'claude-code' | 'codex'

export type ConnectOptions = {
  /** Project directory that receives `.mcp.json`/`.codex` and the project skill. */
  dir: string
  /** Also install the skill to `~/.claude/skills` (all projects; Claude Code). */
  user?: boolean
  /** Register the MCP server with write access (default: read-only). */
  writes?: boolean
  /** Bootstrap a vault checkout here (writes CLAUDE.md/AGENTS.md/index.md too). */
  vault?: string
  /** Backend the registered server + self-check target. */
  db?: string
  apiUrl?: string
  agent?: string
  key?: string
  /** Skip the closing self-check. */
  noCheck?: boolean
}

export type ChangeStatus = 'created' | 'updated' | 'unchanged'
export type ConnectChange = { path: string; status: ChangeStatus; note?: string }

export type McpServerEntry = { command: string; args: string[]; env?: Record<string, string> }

// ─── MCP server entry ─────────────────────────────────────────────────────────

/** Build the MCP server registration for the requested backend and mode. */
export function buildServerEntry(options: ConnectOptions): McpServerEntry {
  const args = ['mcp', 'serve']
  if (options.agent) args.push('--agent', options.agent)
  if (options.db) args.push('--db', options.db)
  if (options.apiUrl) args.push('--api-url', options.apiUrl)
  const env = options.writes ? undefined : { XNET_READONLY: '1' }
  return { command: 'xnet', args, ...(env ? { env } : {}) }
}

// ─── File writers (idempotent; report created/updated/unchanged) ──────────────

async function upsertFile(path: string, content: string): Promise<ConnectChange> {
  let existing: string | null = null
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    // absent
  }
  if (existing === content) return { path, status: 'unchanged' }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return { path, status: existing === null ? 'created' : 'updated' }
}

/** Fences marking the region of an instruction file that `xnet connect` owns. */
export const MANAGED_BEGIN = '<!-- xnet:begin (managed by `xnet connect` — edits here are lost) -->'
export const MANAGED_END = '<!-- xnet:end -->'

/**
 * Replace only the block we own, and leave the rest of the file alone.
 *
 * `CLAUDE.md` and `AGENTS.md` are the user's, not ours — in this very repo
 * `CLAUDE.md` is the entry point to the whole instruction tree. `xnet connect`
 * used to write them wholesale, so wiring up a workspace destroyed whatever was
 * already there. `.mcp.json` was carefully merged the whole time; the
 * instruction files just never got the same care (exploration 0415).
 *
 * Three cases: no file → create with the block; markers present → replace
 * between them; content but no markers → append, preserving every existing byte.
 */
export function mergeManagedBlock(existing: string | null, block: string): string {
  const managed = `${MANAGED_BEGIN}\n\n${block.trim()}\n\n${MANAGED_END}\n`
  if (existing === null || existing.trim() === '') return managed

  const begin = existing.indexOf(MANAGED_BEGIN)
  const end = existing.indexOf(MANAGED_END)
  if (begin !== -1 && end > begin) {
    const before = existing.slice(0, begin)
    const after = existing.slice(end + MANAGED_END.length).replace(/^\n/, '')
    return `${before}${managed}${after}`
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${managed}`
}

/** Idempotently merge the managed block into an instruction file. */
export async function upsertManagedFile(path: string, block: string): Promise<ConnectChange> {
  let existing: string | null = null
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    // absent
  }
  const next = mergeManagedBlock(existing, block)
  if (existing === next) return { path, status: 'unchanged' }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, 'utf8')
  return {
    path,
    status: existing === null ? 'created' : 'updated',
    ...(existing !== null && !existing.includes(MANAGED_BEGIN)
      ? { note: 'appended; existing content preserved' }
      : {})
  }
}

/** Merge `mcpServers.xnet` into a Claude Code `.mcp.json` (project scope). */
export async function writeMcpJson(dir: string, entry: McpServerEntry): Promise<ConnectChange> {
  const path = join(dir, '.mcp.json')
  let doc: { mcpServers?: Record<string, unknown> } = {}
  let existed = false
  try {
    doc = JSON.parse(await readFile(path, 'utf8')) as typeof doc
    existed = true
  } catch {
    // new file
  }
  doc.mcpServers ??= {}
  const before = JSON.stringify(doc.mcpServers.xnet ?? null)
  doc.mcpServers.xnet = entry
  if (existed && JSON.stringify(doc.mcpServers.xnet) === before) {
    return { path, status: 'unchanged' }
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return { path, status: existed ? 'updated' : 'created' }
}

/** Merge `[mcp_servers.xnet]` into a Codex `.codex/config.toml`. */
export async function writeCodexConfig(dir: string, entry: McpServerEntry): Promise<ConnectChange> {
  const path = join(dir, '.codex', 'config.toml')
  let doc: { mcp_servers?: Record<string, unknown> } = {}
  let existed = false
  try {
    doc = parseToml(await readFile(path, 'utf8')) as typeof doc
    existed = true
  } catch {
    // new file
  }
  doc.mcp_servers ??= {}
  const nextEntry = {
    command: entry.command,
    args: entry.args,
    ...(entry.env ? { env: entry.env } : {})
  }
  const before = JSON.stringify(doc.mcp_servers.xnet ?? null)
  doc.mcp_servers.xnet = nextEntry
  if (existed && JSON.stringify(doc.mcp_servers.xnet) === before) {
    return { path, status: 'unchanged' }
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${stringifyToml(doc)}\n`, 'utf8')
  return { path, status: existed ? 'updated' : 'created' }
}

/** Instruction file an agent reads first — the CLI-first contract. */
export function renderHarnessInstructions(): string {
  return `# Working with the user's xNet workspace

This project is wired to xNet: the user's pages, databases, and canvases live
in an xNet store, reachable through the \`xnet\` CLI. The database is the source
of truth; any checked-out files are a working tree.

## Reach for lanes in this order

1. **CLI (default, token-cheap).** \`xnet search "<text>"\` for ranked hits,
   \`xnet query <database> --where field=value\` for tables, \`xnet db get <id>\`
   for a node. These are plain stdout — grep and pipe them.
2. **Vault.** \`xnet checkout --query "<text>"\` (or \`--schema\`/\`--node\`/
   \`--kind\`) materializes a **scoped** slice as Markdown you can Read/Edit.
   Never check out the whole workspace — scope every checkout.
3. **MCP.** The registered \`xnet\` MCP server is the fallback for tasks a shell
   can't do; prefer the CLI when both work (it costs far fewer tokens).

## Writing is deliberate

- Edit vault files, then \`xnet commit\` to turn edits into validated mutation
  plans; \`xnet commit --apply\` applies them. \`xnet status\` shows pending
  plans and conflicts.
- The MCP server is **read-only** unless it was connected with \`--writes\`.
- Never edit \`xnet\` frontmatter — node identity lives there, not in filenames.

See \`SKILL.md\` for the full workflow.
`
}

/** A catalog of the materialized vault files (index.md). */
export function renderVaultIndex(entries: Array<{ path: string; id: string }>): string {
  const lines = entries.map((entry) => `- [${entry.path}](${entry.path}) — \`${entry.id}\``)
  return `# xNet vault index

${entries.length} file(s) checked out. The xNet store remains the source of
truth; edit here and run \`xnet commit\`.

${lines.join('\n')}
`
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export async function runConnect(
  harness: ConnectHarness,
  options: ConnectOptions
): Promise<ConnectChange[]> {
  const dir = resolve(options.dir)
  const changes: ConnectChange[] = []
  const entry = buildServerEntry(options)

  if (harness === 'claude-code') {
    changes.push(
      await upsertFile(join(dir, '.claude', 'skills', 'xnet', 'SKILL.md'), XNET_AGENT_SKILL_MD)
    )
    if (options.user) {
      changes.push(
        await upsertFile(
          join(homedir(), '.claude', 'skills', 'xnet', 'SKILL.md'),
          XNET_AGENT_SKILL_MD
        )
      )
    }
    changes.push(await writeMcpJson(dir, entry))
    changes.push(await upsertManagedFile(join(dir, 'CLAUDE.md'), renderHarnessInstructions()))
  } else {
    changes.push(await upsertManagedFile(join(dir, 'AGENTS.md'), renderHarnessInstructions()))
    changes.push(await writeCodexConfig(dir, entry))
  }

  if (options.vault) {
    changes.push(...(await bootstrapVault(options)))
  }

  return changes
}

async function bootstrapVault(options: ConnectOptions): Promise<ConnectChange[]> {
  const vaultDir = resolve(options.vault as string)
  const [{ resolveAgentBackend }, { createAgentServices, runCheckout }] = await Promise.all([
    import('../utils/agent-backend.js'),
    import('./agent.js')
  ])
  const backend = await resolveAgentBackend({
    ...(options.db ? { db: options.db } : {}),
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.key ? { key: options.key } : {})
  })
  try {
    const services = createAgentServices(backend)
    const output = await runCheckout(services, { dir: vaultDir, limit: 50 })
    const entries = output
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [path, id] = line.split('\t')
        return { path, id: id ?? '' }
      })
    const changes: ConnectChange[] = [{ path: vaultDir, status: 'updated', note: 'vault checkout' }]
    // Claude Code's native instruction filename beside the exporter's AGENTS.md.
    changes.push(await upsertManagedFile(join(vaultDir, 'CLAUDE.md'), renderHarnessInstructions()))
    changes.push(await upsertFile(join(vaultDir, 'index.md'), renderVaultIndex(entries)))
    return changes
  } finally {
    await backend.dispose()
  }
}

// ─── Command Registration ─────────────────────────────────────────────────────

export function registerConnectCommand(program: Command): void {
  program
    .command('connect <harness>')
    .description('Wire a coding agent (claude-code|codex) to this workspace (exploration 0393)')
    .option('-d, --dir <path>', 'Project directory to configure', '.')
    .option('--user', 'Also install the skill to ~/.claude/skills (Claude Code, all projects)')
    .option('--writes', 'Register the MCP server with write access (default: read-only)')
    .option('--vault <dir>', 'Also bootstrap a vault checkout here')
    .option('--db <path>', 'Backend: standalone SQLite store ($XNET_DB)')
    .option('--api-url <url>', 'Backend: local API URL')
    .option('--agent <name>', 'Backend: enrolled agent passport for signed writes')
    .option('--key <hex>', 'Backend: Ed25519 signing key for the local store')
    .option('--no-check', 'Skip the closing agent-access self-check')
    .action(async (harness: string, options: ConnectOptions) => {
      if (harness !== 'claude-code' && harness !== 'codex') {
        console.error(`Unknown harness "${harness}". Use: claude-code | codex`)
        process.exitCode = 1
        return
      }
      const changes = await runConnect(harness, options)
      for (const change of changes) {
        const label = change.note ? `${change.status} (${change.note})` : change.status
        console.log(`${label}\t${change.path}`)
      }
      if (!options.noCheck) {
        const { runAgentAccessCheck } = await import('./doctor.js')
        await runAgentAccessCheck({
          ...(options.db ? { db: options.db } : {}),
          ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
          ...(options.agent ? { agent: options.agent } : {})
        })
      }
    })
}
