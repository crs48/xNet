/**
 * `xnet connect` (exploration 0393): the on-ramp writers must be idempotent
 * (re-running changes nothing) and register a read-only server by default.
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildServerEntry,
  MANAGED_BEGIN,
  MANAGED_END,
  mergeManagedBlock,
  NPX_LAUNCHER,
  resolveServerLauncher,
  runConnect,
  writeCodexConfig,
  writeMcpJson,
  XNET_PATH_LAUNCHER,
  type ConnectOptions
} from '../commands/connect.js'

describe('xnet connect', () => {
  let dir: string
  const base: ConnectOptions = { dir: '', db: '/tmp/data.db', noCheck: true }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-connect-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('builds a read-only server entry by default, writable with --writes', () => {
    expect(buildServerEntry({ dir, db: '/d.db' }).env).toEqual({ XNET_READONLY: '1' })
    expect(buildServerEntry({ dir, db: '/d.db', writes: true }).env).toBeUndefined()
    expect(buildServerEntry({ dir, db: '/d.db' }).args).toEqual(['mcp', 'serve', '--db', '/d.db'])
  })

  it('registers an npx launcher when xnet is not on PATH (zero-install connect)', async () => {
    // A PATH with no xnet bin anywhere → the npx fallback, so the registered
    // server survives after the `npx @xnetjs/cli connect …` cache is gone.
    expect(resolveServerLauncher({ PATH: dir })).toEqual(NPX_LAUNCHER)

    // A PATH dir that does hold an xnet bin → register the real thing.
    await writeFile(join(dir, 'xnet'), '#!/bin/sh\n')
    expect(resolveServerLauncher({ PATH: `${dir}` })).toEqual(XNET_PATH_LAUNCHER)

    const entry = buildServerEntry({ dir, db: '/d.db' }, NPX_LAUNCHER)
    expect(entry.command).toBe('npx')
    expect(entry.args).toEqual(['-y', '@xnetjs/cli', 'mcp', 'serve', '--db', '/d.db'])
  })

  it('claude-code writes skill, .mcp.json, and CLAUDE.md; is idempotent', async () => {
    const changes = await runConnect('claude-code', { ...base, dir }, XNET_PATH_LAUNCHER)
    const byPath = Object.fromEntries(changes.map((c) => [c.path.replace(dir, ''), c.status]))
    expect(byPath['/.claude/skills/xnet/SKILL.md']).toBe('created')
    expect(byPath['/.mcp.json']).toBe('created')
    expect(byPath['/CLAUDE.md']).toBe('created')

    const mcp = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.xnet.command).toBe('xnet')
    expect(mcp.mcpServers.xnet.env).toEqual({ XNET_READONLY: '1' })

    // Re-run: everything unchanged.
    const again = await runConnect('claude-code', { ...base, dir }, XNET_PATH_LAUNCHER)
    expect(again.every((c) => c.status === 'unchanged')).toBe(true)
  })

  it('codex writes AGENTS.md and .codex/config.toml with a valid server block', async () => {
    const changes = await runConnect('codex', { ...base, dir, writes: true }, XNET_PATH_LAUNCHER)
    const byPath = Object.fromEntries(changes.map((c) => [c.path.replace(dir, ''), c.status]))
    expect(byPath['/AGENTS.md']).toBe('created')
    expect(byPath['/.codex/config.toml']).toBe('created')

    const doc = parseToml(await readFile(join(dir, '.codex', 'config.toml'), 'utf8')) as {
      mcp_servers: { xnet: { command: string; args: string[]; env?: unknown } }
    }
    expect(doc.mcp_servers.xnet.command).toBe('xnet')
    expect(doc.mcp_servers.xnet.args).toContain('serve')
    expect(doc.mcp_servers.xnet.env).toBeUndefined() // --writes → no readonly env
  })

  it('preserves unrelated entries when merging .mcp.json', async () => {
    await writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'foo' } } }, null, 2)
    )
    await writeMcpJson(dir, buildServerEntry({ dir, db: '/d.db' }))
    const doc = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
    expect(doc.mcpServers.other.command).toBe('foo')
    expect(doc.mcpServers.xnet.command).toBe('xnet')
  })

  // `.mcp.json` was merged from day one; the instruction files were written
  // wholesale, so connecting a repo that already had a CLAUDE.md destroyed it
  // (exploration 0415).
  it('preserves an existing CLAUDE.md, appending the managed block', async () => {
    const original = '# My project\n\n@AGENTS.md\n\nHouse rules that took months.\n'
    await writeFile(join(dir, 'CLAUDE.md'), original)

    await runConnect('claude-code', { ...base, dir }, XNET_PATH_LAUNCHER)
    const merged = await readFile(join(dir, 'CLAUDE.md'), 'utf8')
    expect(merged).toContain('# My project')
    expect(merged).toContain('House rules that took months.')
    expect(merged).toContain('@AGENTS.md')
    expect(merged).toContain(MANAGED_BEGIN)
    expect(merged).toContain("Working with the user's xNet workspace")
  })

  it('rewrites only the managed block on a re-run, leaving edits outside it', async () => {
    await runConnect('claude-code', { ...base, dir }, XNET_PATH_LAUNCHER)
    const first = await readFile(join(dir, 'CLAUDE.md'), 'utf8')
    await writeFile(join(dir, 'CLAUDE.md'), `${first}\n## My own section\n\nKeep me.\n`)

    const again = await runConnect('claude-code', { ...base, dir }, XNET_PATH_LAUNCHER)
    const merged = await readFile(join(dir, 'CLAUDE.md'), 'utf8')
    expect(merged).toContain('## My own section')
    expect(merged).toContain('Keep me.')
    // Exactly one managed block, not one per run.
    expect(merged.split(MANAGED_BEGIN)).toHaveLength(2)
    expect(again.find((c) => c.path.endsWith('CLAUDE.md'))?.status).toBe('unchanged')
  })

  it('preserves an existing AGENTS.md on the codex path', async () => {
    await writeFile(join(dir, 'AGENTS.md'), '# Existing agent rules\n')
    await runConnect('codex', { ...base, dir }, XNET_PATH_LAUNCHER)
    const merged = await readFile(join(dir, 'AGENTS.md'), 'utf8')
    expect(merged).toContain('# Existing agent rules')
    expect(merged).toContain(MANAGED_BEGIN)
  })

  it('mergeManagedBlock replaces between markers without touching the surroundings', () => {
    const existing = `head\n\n${MANAGED_BEGIN}\n\nold\n\n${MANAGED_END}\ntail\n`
    const next = mergeManagedBlock(existing, 'new')
    expect(next).toContain('head')
    expect(next).toContain('tail')
    expect(next).toContain('new')
    expect(next).not.toContain('old')
  })

  it('preserves unrelated keys when merging .codex/config.toml', async () => {
    await mkdir(join(dir, '.codex'), { recursive: true })
    await writeFile(join(dir, '.codex', 'config.toml'), 'model = "o3"\n')
    await writeCodexConfig(dir, buildServerEntry({ dir, db: '/d.db' }))
    const doc = parseToml(await readFile(join(dir, '.codex', 'config.toml'), 'utf8')) as {
      model: string
      mcp_servers: { xnet: unknown }
    }
    expect(doc.model).toBe('o3')
    expect(doc.mcp_servers.xnet).toBeDefined()
  })
})
