import type { AgentFrame, StreamTurnRequest, StreamTurnResult } from '@xnetjs/devkit'
import type { CommunityAgentSnapshot } from '@xnetjs/workbench/community-agents'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  dir: '',
  handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
  nodes: new Map<string, unknown>(),
  turns: [] as StreamTurnRequest[],
  complete: undefined as (() => void) | undefined
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) =>
      fixture.handlers.set(name, handler)
  },
  safeStorage: {}
}))
vi.mock('./profile', () => ({
  get dataPath() {
    return fixture.dir
  },
  profile: 'test'
}))
vi.mock('./identity-seed', () => ({
  getOrCreateIdentitySeed: () => ({ seed: new Uint8Array(32) })
}))
vi.mock('@xnetjs/identity', () => ({ identityFromPrivateKey: () => ({ did: 'did:key:owner' }) }))
vi.mock('./renderer-store-proxy', () => ({
  setupStoreResponseHandler: () => {},
  sendStoreRequest: async (operation: string, params: { id: string; schemaId?: string }) =>
    operation === 'list'
      ? [...fixture.nodes.values()].filter(
          (node) => (node as { schemaId: string }).schemaId === params.schemaId
        )
      : (fixture.nodes.get(params.id) ?? null)
}))
vi.mock('./community-agent-runtime', () => {
  const runtime = {
    id: 'installed',
    provider: 'codex',
    path: '/test/codex',
    version: 'codex-cli 0.162.0-alpha.17.2',
    state: 'available',
    detail: ''
  }
  const prepare = async () => ({
    runtime: { ...runtime, state: 'ready' },
    agent: {
      streamTurnFrames: async (
        turn: StreamTurnRequest,
        emit: (frame: AgentFrame) => void
      ): Promise<StreamTurnResult> => {
        fixture.turns.push(turn)
        emit({ type: 'session', sessionId: 'private-provider-session' })
        emit({ type: 'delta', text: 'partial' })
        return new Promise((resolve, reject) => {
          fixture.complete = () =>
            resolve({ text: 'complete answer', sessionId: 'private-provider-session' })
          turn.signal?.addEventListener('abort', () => reject(turn.signal?.reason), { once: true })
        })
      }
    }
  })
  return {
    discoverCommunityRuntimes: async () => [runtime],
    prepareCodex: prepare,
    prepareClaude: prepare
  }
})
let stop: () => void
const mainFrame = {}
const sender = { mainFrame, send: vi.fn() }
const event = { sender, senderFrame: mainFrame }
const invoke = <T = unknown>(method: string, input?: unknown): Promise<T> =>
  fixture.handlers.get(`xnet:community-agents:${method}`)!(event, input) as Promise<T>
const message = (id: string) => ({
  id,
  schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
  properties: { channel: 'chat', content: 'Synthetic question' },
  createdBy: 'did:key:owner',
  createdAt: Date.now(),
  updatedAt: Date.now()
})
beforeEach(async () => {
  vi.resetModules()
  fixture.dir = mkdtempSync(join(tmpdir(), 'xnet-agent-service-'))
  fixture.handlers.clear()
  fixture.nodes.clear()
  fixture.turns.length = 0
  fixture.complete = undefined
  fixture.nodes.set('chat', {
    id: 'chat',
    schemaId: 'xnet://xnet.fyi/Channel@1.0.0',
    properties: { members: ['did:key:owner'] },
    createdBy: 'did:key:owner',
    createdAt: 1,
    updatedAt: 1
  })
  fixture.nodes.set('message', message('message'))
  const service = await import('./community-agent-service')
  stop = service.stopCommunityAgents
  service.setupCommunityAgentIPC(() => ({ webContents: sender, isDestroyed: () => false }) as never)
  await invoke('discover')
  await invoke('connect', 'installed')
  await invoke('bind', {
    channelId: 'chat',
    runtimeId: 'installed',
    provider: 'codex',
    context: 'recent',
    mode: 'direct',
    enabled: true
  })
})
afterEach(async () => {
  stop()
  await new Promise((resolve) => setTimeout(resolve, 10))
  rmSync(fixture.dir, { recursive: true, force: true })
})
describe('desktop community agent lifecycle', () => {
  const input = { channelId: 'chat', messageId: 'message', contextIds: [], purpose: 'reply' }
  it('rejects subframes and another window before reading or mutating state', () => {
    const handler = fixture.handlers.get('xnet:community-agents:start')!
    expect(() => handler({ sender, senderFrame: {} }, input)).toThrow('main xNet window')
    expect(() => handler({ sender: { mainFrame }, senderFrame: mainFrame }, input)).toThrow(
      'main xNet window'
    )
  })
  it('deduplicates requests, keeps session IDs private, and requires a saved reply before acknowledgment', async () => {
    const ids = await Promise.all([invoke<string>('start', input), invoke<string>('start', input)])
    expect(ids[0]).toBe(ids[1])
    expect(fixture.turns).toHaveLength(1)
    expect(JSON.stringify(await invoke('snapshot'))).not.toContain('private-provider-session')
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    await expect(invoke('acknowledge', ids[0])).rejects.toThrow('Save the attributed reply')
    const replyId = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].replyId
    fixture.nodes.set(replyId, message(replyId))
    await invoke('acknowledge', ids[0])
    expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].published).toBe(true)
  })
  it('cancels without publishing partial output and retries as a distinct explicit attempt', async () => {
    const id = await invoke<string>('start', input)
    await invoke('cancel', id)
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('cancelled')
    )
    await expect(invoke('authorizePublication', id)).rejects.toThrow('No completed run')
    const next = await invoke<string>('retry', id)
    expect(next).not.toBe(id)
    expect(fixture.turns).toHaveLength(2)
  })
  it('denies publication after an audience change', async () => {
    const id = await invoke<string>('start', input)
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    const channel = fixture.nodes.get('chat') as { properties: Record<string, unknown> }
    channel.properties.members = ['did:key:owner', 'did:key:new-audience']
    await expect(invoke('authorizePublication', id)).rejects.toThrow('Audience changed')
  })
  it('denies publication when a Space gains a member absent from the channel list', async () => {
    const channel = fixture.nodes.get('chat') as { properties: Record<string, unknown> }
    channel.properties.space = 'community'
    fixture.nodes.set('community', {
      id: 'community',
      properties: { owners: ['did:key:owner'] },
      updatedAt: 1
    })
    const member = (id: string, did: string, role: string) => ({
      id,
      schemaId: 'xnet://xnet.fyi/SpaceMembership@1.0.0',
      updatedAt: 1,
      properties: { space: 'community', member: did, role }
    })
    fixture.nodes.set('owner-member', member('owner-member', 'did:key:owner', 'owner'))
    const id = await invoke<string>('start', input)
    fixture.nodes.set('new-member', member('new-member', 'did:key:new', 'viewer'))
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('failed')
    )
    await expect(invoke('authorizePublication', id)).rejects.toThrow('No completed run')
  })
  it('rejects expired membership and unsupported inherited community audiences', async () => {
    const channel = fixture.nodes.get('chat') as { properties: Record<string, unknown> }
    channel.properties.space = 'community'
    const space = {
      id: 'community',
      properties: { owners: ['did:key:owner'], parent: '' },
      updatedAt: 1
    }
    fixture.nodes.set('community', space)
    fixture.nodes.set('owner-member', {
      id: 'owner-member',
      schemaId: 'xnet://xnet.fyi/SpaceMembership@1.0.0',
      updatedAt: 1,
      properties: {
        space: 'community',
        member: 'did:key:owner',
        role: 'owner',
        expiresAt: Date.now() - 1
      }
    })
    await expect(invoke('start', input)).rejects.toThrow('no longer active')
    space.properties.parent = 'ancestor'
    await expect(invoke('start', input)).rejects.toThrow('top-level communities')
    expect(fixture.turns).toHaveLength(0)
  })
  it('reconciles a crash journal to interrupted without silently restarting computation', async () => {
    await invoke('start', input)
    const path = join(fixture.dir, 'community-agents', 'state.json')
    const crashSnapshot = readFileSync(path, 'utf8')
    stop()
    await new Promise((resolve) => setTimeout(resolve, 10))
    writeFileSync(path, crashSnapshot)
    vi.resetModules()
    const restarted = await import('./community-agent-service')
    stop = restarted.stopCommunityAgents
    restarted.setupCommunityAgentIPC(
      () => ({ webContents: sender, isDestroyed: () => false }) as never
    )
    const state = await invoke<CommunityAgentSnapshot>('snapshot')
    expect(state.runs[0].status).toBe('interrupted')
    expect(fixture.turns).toHaveLength(1)
    expect(state.runtimes[0].state).toBe('available')
  })
})
