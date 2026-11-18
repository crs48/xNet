import type { AgentFrame, StreamTurnRequest, StreamTurnResult } from '@xnetjs/devkit'
import type {
  CommunityAgentSnapshot,
  CommunityAgentDelegation,
  CommunityAgentRuntime,
  CommunityAgentExtension
} from '@xnetjs/workbench/community-agents'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  developmentMessage,
  captureDevelopmentInput,
  createExtensionVersion,
  type DevelopmentRecord
} from '@xnetjs/workbench/extension-development'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  dir: '',
  handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
  nodes: new Map<string, unknown>(),
  turns: [] as StreamTurnRequest[],
  emit: undefined as ((frame: AgentFrame) => void) | undefined,
  complete: undefined as ((text?: string) => void) | undefined
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) =>
      fixture.handlers.set(name, handler)
  },
  safeStorage: {}
}))
vi.mock('./community-extension-check', () => ({
  checkCommunityExtension: async ({
    extension,
    signal
  }: {
    extension: CommunityAgentExtension
    signal: AbortSignal
  }) => {
    signal.throwIfAborted()
    return {
      extension,
      report: {
        status: 'passed',
        summary: 'Controls checked.',
        steps: ['click'],
        actions: 1,
        revisions: 0
      }
    }
  }
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
  const claude = {
    ...runtime,
    id: 'installed-claude',
    provider: 'claude',
    path: '/test/claude',
    version: '2.1.304 (Claude Code)'
  }
  const prepare = async (selected: CommunityAgentRuntime) => ({
    runtime: { ...selected, state: 'ready' },
    agent: {
      streamTurnFrames: async (
        turn: StreamTurnRequest,
        emit: (frame: AgentFrame) => void
      ): Promise<StreamTurnResult> => {
        fixture.emit = emit
        fixture.turns.push(turn)
        emit({ type: 'session', sessionId: 'private-provider-session' })
        emit({ type: 'delta', text: '{"reply":"partial' })
        return new Promise((resolve, reject) => {
          fixture.complete = (
            text = JSON.stringify({ reply: 'complete answer', extension: null })
          ) => resolve({ text, sessionId: 'private-provider-session' })
          turn.signal?.addEventListener('abort', () => reject(turn.signal?.reason), { once: true })
        })
      }
    }
  })
  return {
    discoverCommunityRuntimes: async () => [runtime, claude],
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
  fixture.emit = undefined
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
  const input = { channelId: 'chat', messageId: 'message', contextIds: [] }
  it('runs Claude and Codex independently while preventing overlapping work on one runtime', async () => {
    const codexId = await invoke<string>('start', input)
    fixture.nodes.set('another-message', message('another-message'))
    await expect(invoke('start', { ...input, messageId: 'another-message' })).rejects.toThrow(
      'This agent is already working'
    )
    fixture.nodes.set('claude-chat', {
      id: 'claude-chat',
      schemaId: 'xnet://xnet.fyi/Channel@1.0.0',
      properties: { members: ['did:key:owner'] },
      createdBy: 'did:key:owner',
      createdAt: 1,
      updatedAt: 1
    })
    fixture.nodes.set('claude-message', {
      ...message('claude-message'),
      properties: { channel: 'claude-chat', content: 'A separate Claude question' }
    })
    await invoke('connect', 'installed-claude')
    await invoke('bind', {
      channelId: 'claude-chat',
      runtimeId: 'installed-claude',
      provider: 'claude',
      context: 'question',
      mode: 'direct',
      enabled: true
    })
    await invoke('start', { channelId: 'claude-chat', messageId: 'claude-message', contextIds: [] })
    expect(fixture.turns).toHaveLength(2)
    expect(
      (await invoke<CommunityAgentSnapshot>('snapshot')).runs.map((run) => run.status)
    ).toEqual(['running', 'running'])
    await invoke('cancel', codexId)
    await vi.waitFor(async () =>
      expect(
        (await invoke<CommunityAgentSnapshot>('snapshot')).runs.map((run) => run.status)
      ).toEqual(['cancelled', 'running'])
    )
    expect(fixture.turns[1].signal?.aborted).toBe(false)
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].status).toBe('completed')
    )
  })
  it('uses an explicitly selected reviewed version and records its parent independently of recent drafts', async () => {
    fixture.nodes.set('selected-version', {
      id: 'selected-version',
      schemaId: 'xnet://xnet.fyi/PluginSource@1.0.0',
      createdBy: 'did:key:owner',
      createdAt: 1,
      updatedAt: 1,
      properties: {
        name: 'Older branch',
        description: 'Original base',
        files: {
          'index.tsx': 'export default function V() { return <p>EXPLICIT_SELECTED_BASE</p> }'
        },
        manifest: { chatPreview: { channelId: 'chat', lineage: { versionId: 'a'.repeat(64) } } }
      }
    })
    await invoke('start', { ...input, extensionRevisionId: 'selected-version' })
    expect(fixture.turns.at(-1)?.prompt).toContain('EXPLICIT_SELECTED_BASE')
    const snapshot = await invoke<CommunityAgentSnapshot>('snapshot')
    expect(snapshot.runs.at(-1)).toMatchObject({
      baseRevisionId: 'selected-version',
      baseVersionId: 'a'.repeat(64)
    })
    fixture.complete!()
  })
  it('rejects a missing explicit base without starting a provider turn', async () => {
    await expect(invoke('start', { ...input, extensionRevisionId: 'missing' })).rejects.toThrow(
      'selected extension'
    )
    expect(fixture.turns).toHaveLength(0)
  })
  it('records observed phases once without exposing generated source or provider sessions', async () => {
    await invoke('start', input)
    fixture.emit!({ type: 'delta', text: ' reply", "extension": {' })
    fixture.emit!({ type: 'delta', text: '"title":"Draft", "source":"SECRET_SOURCE' })
    const active = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0]
    expect(active.activity?.map((entry) => entry.phase)).toEqual([
      'connecting',
      'waiting',
      'replying',
      'drafting'
    ])
    expect(active.text).toBe('partial reply')
    expect(JSON.stringify(active)).not.toContain('SECRET_SOURCE')
    expect(JSON.stringify(active)).not.toContain('private-provider-session')
    fixture.complete!(
      JSON.stringify({
        reply: 'Ready',
        extension: {
          title: 'Draft',
          summary: '',
          source: 'export default () => null'
        }
      })
    )
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    const completed = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0]
    expect(completed.activity?.map((entry) => entry.phase)).toEqual([
      'connecting',
      'waiting',
      'replying',
      'drafting',
      'checking'
    ])
    const journal = JSON.parse(
      readFileSync(join(fixture.dir, 'community-agents', 'state.json'), 'utf8')
    )
    expect(journal.runs[0].activity).toEqual(completed.activity)
  })
  it('rejects subframes and another window before reading or mutating state', () => {
    const handler = fixture.handlers.get('xnet:community-agents:start')!
    expect(() => handler({ sender, senderFrame: {} }, input)).toThrow('main xNet window')
    expect(() => handler({ sender: { mainFrame }, senderFrame: mainFrame }, input)).toThrow(
      'main xNet window'
    )
  })
  it('stops an unexpected tool frame and never publishes it as completed work', async () => {
    const id = await invoke<string>('start', input)
    fixture.emit!({ type: 'tool_call', id: 'unexpected', name: 'commandExecution' })
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('cancelled')
    )
    const stopped = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0]
    expect(stopped.error).toContain('unsupported tool call')
    expect(stopped.activity?.some((entry) => entry.phase === 'checking')).toBe(false)
    await expect(invoke('authorizePublication', id)).rejects.toThrow('No completed run')
  })
  it('deduplicates requests, keeps session IDs private, and requires a saved reply before acknowledgment', async () => {
    const ids = await Promise.all([invoke<string>('start', input), invoke<string>('start', input)])
    expect(ids[0]).toBe(ids[1])
    expect(fixture.turns).toHaveLength(1)
    expect(fixture.turns[0].outputSchema).toHaveProperty('properties.extension')
    expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].text).toBe('partial')
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
  it('returns an extension alongside a reply and carries it into a normal follow-up', async () => {
    const extension = {
      title: 'Films',
      summary: 'A watchlist',
      source: 'export default () => ({type:"text",text:"Films"})'
    }
    await invoke('start', input)
    fixture.complete!(JSON.stringify({ reply: 'Preview this watchlist.', extension }))
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    const run = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0]
    expect(run.text).toBe(
      'Preview this watchlist.\n\nPreview checked in an isolated test copy. Controls checked.'
    )
    expect(run.previewCheck?.status).toBe('passed')
    expect(run.extension).toEqual(extension)
    expect(run.purpose).toBe('reply')
    fixture.nodes.set('follow-up', {
      ...message('follow-up'),
      properties: { channel: 'chat', content: 'Show a count above it.' }
    })
    await invoke('start', { ...input, messageId: 'follow-up', contextIds: ['message'] })
    expect(fixture.turns[1].resumeSessionId).toBe('private-provider-session')
    expect(fixture.turns[1].prompt).toContain(JSON.stringify(extension))
    const revised = { ...extension, source: 'export default () => ({type:"badge",text:"3 films"})' }
    fixture.complete!(JSON.stringify({ reply: 'Added a count to the draft.', extension: revised }))
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].extension).toEqual(revised)
    )
  })
  it('fails an invalid response without publishing it and discards its provider session', async () => {
    const id = await invoke('start', input)
    fixture.complete!('{"reply":"not complete')
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('failed')
    )
    await expect(invoke('authorizePublication', id)).rejects.toThrow('No completed run')
    await invoke('retry', id)
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
    expect(fixture.turns[1].outputSchema).toEqual(fixture.turns[0].outputSchema)
  })
  it('honors message-only context for drafts as well as provider memory', async () => {
    await invoke('start', input)
    fixture.complete!(
      JSON.stringify({
        reply: 'Draft ready.',
        extension: { title: 'Private draft', summary: '', source: 'DRAFT_CANARY' }
      })
    )
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    await invoke('bind', {
      channelId: 'chat',
      runtimeId: 'installed',
      provider: 'codex',
      context: 'question',
      mode: 'direct',
      enabled: true
    })
    fixture.nodes.set('next', message('next'))
    await invoke('start', { ...input, messageId: 'next', contextIds: ['message'] })
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
    expect(fixture.turns[1].prompt).not.toContain('DRAFT_CANARY')
  })
  it('includes an explicitly open same-channel draft in message-only mode and rejects unknown drafts', async () => {
    await invoke('bind', {
      channelId: 'chat',
      runtimeId: 'installed',
      provider: 'codex',
      context: 'question',
      mode: 'direct',
      enabled: true
    })
    const id = await invoke('start', input)
    fixture.complete!(
      JSON.stringify({
        reply: 'Draft',
        extension: { title: 'Game', summary: '', source: 'OPEN_DRAFT_CANARY' }
      })
    )
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    fixture.nodes.set('next', message('next'))
    await expect(
      invoke('start', { ...input, messageId: 'next', extensionRunId: 'unknown' })
    ).rejects.toThrow('selected extension draft')
    await invoke('start', { ...input, messageId: 'next', extensionRunId: id })
    expect(fixture.turns[1].prompt).toContain('OPEN_DRAFT_CANARY')
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
  })
  it('resets the unified conversation session', async () => {
    await invoke('start', input)
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    await invoke('reset', 'chat')
    fixture.nodes.set('next', message('next'))
    await invoke('start', { ...input, messageId: 'next' })
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
  })
  it('does not attach drafts outside selected history or a changed audience', async () => {
    await invoke('start', input)
    fixture.complete!(
      JSON.stringify({
        reply: 'Ready.',
        extension: { title: 'Draft', summary: '', source: 'DRAFT_CANARY' }
      })
    )
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    await invoke('reset', 'chat')
    fixture.nodes.set('next', message('next'))
    await invoke('start', { ...input, messageId: 'next' })
    expect(fixture.turns[1].prompt).not.toContain('DRAFT_CANARY')
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].status).toBe('completed')
    )
    const channel = fixture.nodes.get('chat') as { properties: Record<string, unknown> }
    channel.properties.members = ['did:key:owner', 'did:key:new-audience']
    fixture.nodes.set('changed-audience', message('changed-audience'))
    await invoke('start', { ...input, messageId: 'changed-audience', contextIds: ['message'] })
    expect(fixture.turns[2].prompt).not.toContain('DRAFT_CANARY')
    expect(fixture.turns[2].resumeSessionId).toBeUndefined()
  })
  it('preserves the response format when retrying a draft from the old journal', async () => {
    await invoke('start', input)
    stop()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('cancelled')
    )
    const path = join(fixture.dir, 'community-agents', 'state.json')
    const journal = JSON.parse(readFileSync(path, 'utf8'))
    journal.runs[0].purpose = 'extension'
    journal.runs[0].prompt = 'Original extension request'
    delete journal.runs[0].responseFormat
    writeFileSync(path, JSON.stringify(journal))
    vi.resetModules()
    const restarted = await import('./community-agent-service')
    stop = restarted.stopCommunityAgents
    restarted.setupCommunityAgentIPC(
      () => ({ webContents: sender, isDestroyed: () => false }) as never
    )
    await invoke('retry', journal.runs[0].id)
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(2))
    expect(fixture.turns[1].prompt).toBe('Original extension request')
    expect(fixture.turns[1].outputSchema).toHaveProperty('properties.source')
    const proposal = JSON.stringify({
      title: 'Legacy draft',
      summary: '',
      source: 'export default () => ({type:"text",text:"hi"})'
    })
    fixture.complete!(proposal)
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].status).toBe('completed')
    )
    expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].text).toBe(proposal)
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

async function sharedNode(
  record: DevelopmentRecord,
  content = 'Build a reading list',
  author = 'did:key:owner'
) {
  const message = await developmentMessage(author, 'chat', content, record)
  const node = {
    ...message,
    schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
    createdBy: author,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  fixture.nodes.set(node.id, node)
  return node
}
async function sharedSetup() {
  const channel = fixture.nodes.get('chat') as { properties: Record<string, unknown> }
  channel.properties.space = 'community'
  channel.properties.members = ['did:key:owner', 'did:key:bob']
  fixture.nodes.set('community', {
    id: 'community',
    properties: { owners: ['did:key:owner'] },
    updatedAt: 1
  })
  for (const who of ['owner', 'bob'])
    fixture.nodes.set(who + '-membership', {
      id: who + '-membership',
      schemaId: 'xnet://xnet.fyi/SpaceMembership@1.0.0',
      updatedAt: 1,
      properties: {
        space: 'community',
        member: 'did:key:' + who,
        role: who === 'owner' ? 'owner' : 'member'
      }
    })
  const project = await sharedNode({
    kind: 'project',
    title: 'Reading list',
    brief: 'Links shared in our room',
    nonce: 'project'
  })
  const grant = await invoke<CommunityAgentDelegation>('delegate', {
    projectId: project.id,
    channelId: 'chat',
    requesters: ['did:key:bob'],
    expiresAt: Date.now() + 60000,
    limit: 10
  })
  const request = (
    content = 'Build a reading list',
    parents: string[] = [],
    author = 'did:key:bob'
  ) =>
    sharedNode(
      {
        kind: 'request',
        project: project.id,
        host: 'did:key:owner',
        epoch: grant.epoch,
        parents,
        contextIds: []
      },
      content,
      author
    )
  return { project, grant, request }
}
describe('shared development host authority and queue', () => {
  it('freezes selected revisions at submission and rejects cross-project or changed context', async () => {
    const { project, grant } = await sharedSetup()
    const context = await sharedNode(
      { kind: 'feedback', project: project.id, parents: [] },
      'Only shared context'
    )
    const revision = await captureDevelopmentInput(context)
    const request = await sharedNode(
      {
        kind: 'request',
        project: project.id,
        host: 'did:key:owner',
        epoch: grant.epoch,
        parents: [],
        contextIds: [context.id],
        contextDigests: [revision.digest]
      },
      'Use this feedback',
      'did:key:bob'
    )
    context.properties.content = 'Changed before host admission'
    await expect(invoke('startDevelopment', { requestId: request.id })).rejects.toThrow(
      'Selected context changed'
    )
    context.properties.content = 'Only shared context'
    context.properties.inReplyTo = 'another-project'
    await expect(invoke('startDevelopment', { requestId: request.id })).rejects.toThrow(
      'outside the conversation'
    )
    context.properties.inReplyTo = project.id
    await invoke('startDevelopment', { requestId: request.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    expect(fixture.turns[0].prompt).toContain('Only shared context')
    Object.assign(context.properties, { redacted: true })
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('failed')
    )
    expect(
      (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].development?.output
    ).toBeUndefined()
  })
  it('enforces expiry and a durable session budget before provider dispatch', async () => {
    const { project } = await sharedSetup()
    const grant = await invoke<CommunityAgentDelegation>('delegate', {
      projectId: project.id,
      channelId: 'chat',
      requesters: ['did:key:bob'],
      expiresAt: Date.now() + 60000,
      limit: 1
    })
    const record: DevelopmentRecord = {
      kind: 'request',
      project: project.id,
      host: 'did:key:owner',
      epoch: grant.epoch,
      parents: [],
      contextIds: []
    }
    const first = await sharedNode(record, 'First', 'did:key:bob')
    const second = await sharedNode(record, 'Second', 'did:key:bob')
    await invoke('startDevelopment', { requestId: first.id })
    await expect(invoke('startDevelopment', { requestId: second.id })).rejects.toThrow(
      'request limit'
    )
    const realNow = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(realNow + 120000)
    await expect(invoke('startDevelopment', { requestId: second.id })).rejects.toThrow(
      'not been allowed'
    )
    now.mockRestore()
  })
  it('restores a durable queued request after a crash without resuming the interrupted run', async () => {
    const { request } = await sharedSetup()
    const first = await request('First'),
      second = await request('Second')
    await invoke('startDevelopment', { requestId: first.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    await invoke('startDevelopment', { requestId: second.id })
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
    expect(
      (await invoke<CommunityAgentSnapshot>('snapshot')).runs.map((run) => run.status)
    ).toEqual(['interrupted', 'queued'])
    await invoke('connect', 'installed')
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(2))
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
    expect(fixture.turns[1].prompt).toContain('Second')
  })
  it('runs a delegated peer request with fresh explicit context and preserves its history', async () => {
    const { request } = await sharedSetup()
    const node = await request()
    await invoke('startDevelopment', { requestId: node.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    expect(fixture.turns[0].resumeSessionId).toBeUndefined()
    expect(fixture.turns[0].prompt).toContain('did:key:bob')
    fixture.complete!(
      JSON.stringify({
        reply: 'Here is our first version.',
        extension: { title: 'List', summary: 'First version', source: 'export default () => null' }
      })
    )
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    const run = (await invoke<CommunityAgentSnapshot>('snapshot')).runs[0]
    expect(run.development?.history.inputs[0]).toMatchObject({
      id: node.id,
      author: 'did:key:bob',
      content: 'Build a reading list'
    })
    expect(run.development?.output?.kind).toBe('version')
    expect(run.replyId).toMatch(/^dev-/)
    expect(JSON.stringify(run)).not.toContain('private-provider-session')
    await invoke('authorizePublication', run.id)
  })
  it('queues simultaneous feedback, deduplicates delivery, and starts the next request after completion', async () => {
    const { request } = await sharedSetup()
    const a = await request('First update'),
      b = await request('Second update')
    const [first, duplicate] = await Promise.all([
      invoke('startDevelopment', { requestId: a.id }),
      invoke('startDevelopment', { requestId: a.id })
    ])
    expect(duplicate).toBe(first)
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    await invoke('startDevelopment', { requestId: b.id })
    expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].status).toBe('queued')
    fixture.complete!()
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(2))
    expect(fixture.turns[1].resumeSessionId).toBeUndefined()
    expect(fixture.turns[1].prompt).toContain('Second update')
  })
  it('revokes both running and queued peer requests without dispatching more work', async () => {
    const { project, request } = await sharedSetup()
    const a = await request('First'),
      b = await request('Second')
    await invoke('startDevelopment', { requestId: a.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    await invoke('startDevelopment', { requestId: b.id })
    await invoke('revokeDelegation', project.id)
    await vi.waitFor(async () =>
      expect(
        (await invoke<CommunityAgentSnapshot>('snapshot')).runs.map((run) => run.status)
      ).toEqual(['cancelled', 'cancelled'])
    )
    expect(fixture.turns).toHaveLength(1)
    await expect(invoke('startDevelopment', { requestId: b.id, retry: true })).rejects.toThrow(
      'not been allowed'
    )
  })
  it('rejects outsider delegation, altered requests, and requests intended for another host', async () => {
    const { project, grant, request } = await sharedSetup()
    await expect(
      invoke('delegate', {
        projectId: project.id,
        channelId: 'chat',
        requesters: ['did:key:eve'],
        expiresAt: Date.now() + 60000,
        limit: 10
      })
    ).rejects.toThrow('member')
    const node = await request()
    node.properties.content = 'Changed after signing'
    await expect(invoke('startDevelopment', { requestId: node.id })).rejects.toThrow('changed')
    const other = await sharedNode({
      kind: 'request',
      project: project.id,
      host: 'did:key:other',
      epoch: grant.epoch,
      parents: [],
      contextIds: []
    })
    await expect(invoke('startDevelopment', { requestId: other.id })).rejects.toThrow(
      'another agent host'
    )
    expect(fixture.turns).toHaveLength(0)
  })
  it('denies cross-project source and private cross-channel context', async () => {
    const { project, grant, request } = await sharedSetup()
    const source = await sharedNode({
      kind: 'version',
      project: 'other-project',
      parents: [],
      manual: true,
      extension: await createExtensionVersion({
        title: 'Other',
        summary: '',
        source: 'export default () => null',
        author: 'did:key:owner',
        changeNote: 'Other'
      })
    })
    const node = await request('Edit', [source.id])
    await expect(invoke('startDevelopment', { requestId: node.id })).rejects.toThrow(
      'another project'
    )
    fixture.nodes.set('private', {
      ...message('private'),
      properties: { channel: 'private-room', content: 'PRIVATE_CANARY' }
    })
    const cross = await sharedNode({
      kind: 'request',
      project: project.id,
      host: 'did:key:owner',
      epoch: grant.epoch,
      parents: [],
      contextIds: ['private']
    })
    await expect(invoke('startDevelopment', { requestId: cross.id })).rejects.toThrow(
      'outside the conversation'
    )
    expect(fixture.turns).toHaveLength(0)
  })
  it('honors withdrawal before a queued request reaches the provider', async () => {
    const { project, request } = await sharedSetup()
    const a = await request('First'),
      b = await request('Second')
    await invoke('startDevelopment', { requestId: a.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    await invoke('startDevelopment', { requestId: b.id })
    await sharedNode(
      { kind: 'withdraw', project: project.id, request: b.id },
      'Request withdrawn',
      'did:key:bob'
    )
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].status).toBe('failed')
    )
    expect(fixture.turns).toHaveLength(1)
    expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[1].error).toContain('withdrew')
  })
  it('revalidates retained context and membership before publishing a completed result', async () => {
    const { request } = await sharedSetup()
    const node = await request()
    const id = await invoke('startDevelopment', { requestId: node.id })
    await vi.waitFor(() => expect(fixture.turns).toHaveLength(1))
    fixture.complete!()
    await vi.waitFor(async () =>
      expect((await invoke<CommunityAgentSnapshot>('snapshot')).runs[0].status).toBe('completed')
    )
    const membership = fixture.nodes.get('bob-membership') as {
      properties: Record<string, unknown>
    }
    membership.properties.expiresAt = Date.now() - 1
    await expect(invoke('authorizePublication', id)).rejects.toThrow('Audience changed')
  })
})
