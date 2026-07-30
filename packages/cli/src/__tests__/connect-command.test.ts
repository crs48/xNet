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
  runConnect,
  writeCodexConfig,
  writeMcpJson,
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

  it('claude-code writes skill, .mcp.json, and CLAUDE.md; is idempotent', async () => {
    const changes = await runConnect('claude-code', { ...base, dir })
    const byPath = Object.fromEntries(changes.map((c) => [c.path.replace(dir, ''), c.status]))
    expect(byPath['/.claude/skills/xnet/SKILL.md']).toBe('created')
    expect(byPath['/.mcp.json']).toBe('created')
    expect(byPath['/CLAUDE.md']).toBe('created')

    const mcp = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.xnet.command).toBe('xnet')
    expect(mcp.mcpServers.xnet.env).toEqual({ XNET_READONLY: '1' })

    // Re-run: everything unchanged.
    const again = await runConnect('claude-code', { ...base, dir })
    expect(again.every((c) => c.status === 'unchanged')).toBe(true)
  })

  it('codex writes AGENTS.md and .codex/config.toml with a valid server block', async () => {
    const changes = await runConnect('codex', { ...base, dir, writes: true })
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
