/**
 * `xnet agent enroll` + agent-scoped `mcp serve` (exploration 0337).
 */

import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateIdentity, verifyAgentPassport } from '@xnetjs/identity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runEnroll, openClawStdioSnippet, hermesStdioSnippet } from './enroll'
import { startMcpServe } from './mcp'
import {
  bytesToHex,
  loadAgentPassportFile
} from '../utils/agent-passport-file.js'

let dir: string
const operator = generateIdentity()

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xnet-agents-'))
  process.env.XNET_AGENT_DIR = dir
})

afterEach(() => {
  delete process.env.XNET_AGENT_DIR
})

const enroll = (name = 'homeclaw') =>
  runEnroll(name, {
    runtime: 'openclaw',
    space: ['inbox'],
    can: ['node/create', 'node/update'],
    ttlDays: 7,
    key: bytesToHex(operator.privateKey),
    node: false
  })

describe('xnet agent enroll (exploration 0337)', () => {
  it('mints and persists a passport with a verifying, scoped delegation', async () => {
    const result = await enroll()
    expect(result.passport.agentDID).toMatch(/^did:key:z/)
    expect(result.passport.operatorDID).toBe(operator.identity.did)
    expect(result.passport.capabilities).toEqual([
      { with: 'xnet://space/inbox', can: 'node/create' },
      { with: 'xnet://space/inbox', can: 'node/update' }
    ])

    const verified = verifyAgentPassport(result.passport.ucan, {
      agentDID: result.passport.agentDID,
      operatorDID: operator.identity.did
    })
    expect(verified.valid).toBe(true)

    // Reloadable, and the key file is 0600.
    const loaded = await loadAgentPassportFile('homeclaw')
    expect(loaded?.agentDID).toBe(result.passport.agentDID)
    const mode = (await stat(result.path)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('requires an operator key and at least one space', async () => {
    await expect(
      runEnroll('x', {
        runtime: 'other',
        space: ['inbox'],
        can: ['node/create'],
        ttlDays: 7,
        node: false
      })
    ).rejects.toThrow(/signing key required/)
    await expect(
      runEnroll('x', {
        runtime: 'other',
        space: [],
        can: ['node/create'],
        ttlDays: 7,
        key: bytesToHex(operator.privateKey),
        node: false
      })
    ).rejects.toThrow(/--space/)
  })

  it('emits OpenClaw and Hermes snippets pointing at the same serve command', () => {
    expect(JSON.parse(openClawStdioSnippet('homeclaw')).mcp.servers.xnet.args).toEqual([
      'mcp',
      'serve',
      '--agent',
      'homeclaw'
    ])
    expect(JSON.parse(hermesStdioSnippet('homeclaw')).mcpServers.xnet.args).toEqual([
      'mcp',
      'serve',
      '--agent',
      'homeclaw'
    ])
  })

  it('the passport JSON never contains the operator private key', async () => {
    const result = await enroll('leakcheck')
    const raw = await readFile(result.path, 'utf8')
    expect(raw).not.toContain(bytesToHex(operator.privateKey))
  })
})

describe('xnet mcp serve --agent (exploration 0337)', () => {
  it('an agent-signed local backend records tool calls as AgentAction nodes', async () => {
    const result = await enroll('served')
    const { createLocalAgentBackend } = await import('../utils/agent-local.js')
    const { hexToBytes } = await import('../utils/agent-passport-file.js')
    const { buildMcpServer } = await import('./mcp')

    const backend = await createLocalAgentBackend({
      agentKey: hexToBytes(result.passport.agentKeyHex)
    })
    expect(backend.agentDID).toBe(result.passport.agentDID)

    const server = buildMcpServer(backend, { passport: result.passport })
    const names = server.getTools().map((t) => t.name)
    expect(names).toContain('xnet_approve')
    expect(names).toContain('xnet_poll_notifications')

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'xnet_search',
        arguments: { query: 'anything', _instruction: 'look around' }
      }
    })
    expect(response.error).toBeUndefined()

    const actions = await backend.store.list({
      schemaId: 'xnet://xnet.fyi/AgentAction@1.0.0'
    })
    expect(actions).toHaveLength(1)
    expect(actions[0].properties).toMatchObject({
      tool: 'xnet_search',
      status: 'applied',
      instruction: 'look around'
    })
    await backend.client.destroy()
  })

  it('refuses an unknown passport', async () => {
    await expect(
      startMcpServe(async () => ({ store: {} as never, schemas: {} as never }), {
        agent: 'nope'
      })
    ).rejects.toThrow(/No passport/)
  })
})
