import type { FramedChatAgent } from '@xnetjs/devkit'
import type {
  CommunityAgentBinding,
  CommunityAgentPort,
  CommunityAgentRun,
  CommunityAgentRuntime,
  CommunityAgentSnapshot
} from '@xnetjs/workbench/community-agents'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SPACE_MEMBERSHIP_SCHEMA_IRI } from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import {
  audienceKey,
  buildAgentPrompt,
  requireOwnedChannel,
  type AgentContextNode
} from './community-agent-policy'
import { discoverCommunityRuntimes, prepareCodex, prepareClaude } from './community-agent-runtime'
import { getOrCreateIdentitySeed } from './identity-seed'
import { dataPath, profile } from './profile'
import { sendStoreRequest, setupStoreResponseHandler } from './renderer-store-proxy'

interface LocalRun extends CommunityAgentRun {
  prompt: string
  audience: string
  runtimeId: string
}
interface LocalState {
  version: 1
  owner: string
  runtimes: CommunityAgentRuntime[]
  bindings: CommunityAgentBinding[]
  runs: LocalRun[]
  sessions: Record<string, { audience: string; sessionId: string }>
}
const root = () => join(dataPath, 'community-agents')
const changed = 'xnet:community-agents:changed'
let state: LocalState | undefined
const adapters = new Map<string, FramedChatAgent>()
const controllers = new Map<string, AbortController>()
let pendingSave: ReturnType<typeof setTimeout> | undefined
let hostWindow: (() => BrowserWindow | null) | undefined
let serial = Promise.resolve()
const detail = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
function save() {
  if (!state) return
  if (pendingSave) clearTimeout(pendingSave)
  pendingSave = undefined
  mkdirSync(root(), { recursive: true, mode: 0o700 })
  const path = join(root(), 'state.json')
  writeFileSync(`${path}.next`, JSON.stringify(state), { mode: 0o600 })
  renameSync(`${path}.next`, path)
}
function broadcast(immediate = false) {
  if (immediate) save()
  else pendingSave ??= setTimeout(save, 350)
  const window = hostWindow?.()
  if (window && !window.isDestroyed()) window.webContents.send(changed)
}
function load(): LocalState {
  if (state) return state
  const seed = getOrCreateIdentitySeed(dataPath, safeStorage, {
    profile,
    testMode: process.env.XNET_TEST_BYPASS === 'true'
  }).seed
  const owner = identityFromPrivateKey(seed).did
  const path = join(root(), 'state.json')
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LocalState
    if (
      parsed.version !== 1 ||
      parsed.owner !== owner ||
      !Array.isArray(parsed.runs) ||
      !Array.isArray(parsed.bindings) ||
      !Array.isArray(parsed.runtimes) ||
      !parsed.sessions
    )
      throw new Error('The local agent journal is unreadable or belongs to another identity.')
    state = parsed
    for (const run of state.runs)
      if (run.status === 'running') {
        run.status = 'interrupted'
        run.error =
          'xNet restarted before this run finished. Retry explicitly to start a new attempt.'
        run.finishedAt = Date.now()
      }
    for (const runtime of state.runtimes)
      if (runtime.state === 'ready') {
        runtime.state = 'available'
        runtime.detail = 'Reconnect to verify this runtime after restart.'
      }
    save()
  } else state = { version: 1, owner, runtimes: [], bindings: [], runs: [], sessions: {} }
  return state
}
const getNode = (id: string) => sendStoreRequest<AgentContextNode | null>('get', { id })
async function boundary(binding: CommunityAgentBinding) {
  const current = load()
  const channel = requireOwnedChannel(await getNode(binding.channelId), current.owner)
  const spaceId = channel.properties.space
  const space = typeof spaceId === 'string' ? await getNode(spaceId) : null
  if (typeof spaceId === 'string' && (!space || space.deleted))
    throw new Error('The conversation’s community is unavailable.')
  if (
    space &&
    (!Array.isArray(space.properties.owners) || !space.properties.owners.includes(current.owner))
  )
    throw new Error('Only community owners can enable a local agent in this preview.')
  if (space?.properties.parent)
    throw new Error('Local agents currently support top-level communities only.')
  // Membership edges can change without changing the channel or Space node.
  // Refuse a truncated audience rather than silently omitting a new recipient.
  const membershipWindow = space
    ? await sendStoreRequest<AgentContextNode[]>('list', {
        schemaId: SPACE_MEMBERSHIP_SCHEMA_IRI,
        limit: 2001,
        offset: 0
      })
    : []
  if (membershipWindow.length > 2000)
    throw new Error('This agent preview supports at most 2,000 local community memberships.')
  const memberships = membershipWindow
    .filter(
      (member) =>
        member.schemaId === SPACE_MEMBERSHIP_SCHEMA_IRI &&
        !member.deleted &&
        member.properties.space === space?.id &&
        (member.properties.expiresAt === undefined ||
          (typeof member.properties.expiresAt === 'number' &&
            member.properties.expiresAt > Date.now()))
    )
    .sort((a, b) => a.id.localeCompare(b.id))
  if (
    space &&
    !memberships.some(
      (member) =>
        member &&
        !member.deleted &&
        member.properties.member === current.owner &&
        member.properties.role === 'owner'
    )
  )
    throw new Error('Your community owner membership is no longer active.')
  return (
    audienceKey(channel, space, binding) +
    JSON.stringify(
      memberships.map((member) => [
        member.id,
        member.updatedAt,
        member.properties.member,
        member.properties.role,
        member.properties.expiresAt
      ])
    )
  )
}
async function connect(id: string): Promise<CommunityAgentRuntime> {
  const current = load()
  const index = current.runtimes.findIndex((runtime) => runtime.id === id)
  if (index < 0) throw new Error('Discover and select an installed agent first.')
  const runtime = current.runtimes[index]
  try {
    const prepared = await (runtime.provider === 'codex' ? prepareCodex : prepareClaude)(
      runtime,
      join(root(), runtime.id)
    )
    adapters.set(id, prepared.agent)
    current.runtimes[index] = prepared.runtime
  } catch (cause) {
    adapters.delete(id)
    current.runtimes[index] = {
      ...runtime,
      state: /[Ss]ign in/.test(detail(cause)) ? 'sign-in-required' : 'failed',
      detail: detail(cause)
    }
  }
  broadcast(true)
  return current.runtimes[index]
}
function snapshot(): CommunityAgentSnapshot {
  const current = load()
  return {
    runtimes: current.runtimes,
    bindings: current.bindings,
    runs: current.runs.map(
      ({ prompt: _prompt, audience: _audience, runtimeId: _runtimeId, ...run }) => run
    )
  }
}
const extensionInstructions = `\n\nYou are proposing a private xNet chat extension. Return only JSON with title, summary, and source. source is a single TypeScript file with no imports. Export default a function taking {messages: Array<{id: string, content: string}>} and returning a JSON render tree. Nodes are {type: 'stack'|'grid'|'card'|'text'|'badge', text?: string, children?: Node[]}. No HTML, URLs, events, network, storage, or arbitrary props. Use the supplied messages as data. Keep source under 24,000 characters. The host will compile and preview it separately; do not claim it is installed. If asked for a watchlist, list films or links from message text using text nodes. Follow-up requests should return a complete updated version.`
const extensionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'source'],
  properties: { title: { type: 'string' }, summary: { type: 'string' }, source: { type: 'string' } }
}
async function execute(run: LocalRun, binding: CommunityAgentBinding) {
  const current = load()
  const controller = new AbortController()
  controllers.set(run.id, controller)
  const timeout = setTimeout(
    () => controller.abort(new Error('Run exceeded the five-minute limit.')),
    300_000
  )
  let guardBusy = false
  const guard = setInterval(() => {
    if (guardBusy || controller.signal.aborted) return
    guardBusy = true
    void boundary(binding)
      .then((key) => {
        if (key !== run.audience || !binding.enabled)
          controller.abort(new Error('Conversation audience or agent policy changed.'))
      })
      .catch((cause) => controller.abort(cause))
      .finally(() => {
        guardBusy = false
      })
  }, 2000)
  try {
    let adapter = adapters.get(run.runtimeId)
    if (!adapter) {
      const runtime = await connect(run.runtimeId)
      if (runtime.state !== 'ready') throw new Error(runtime.detail)
      adapter = adapters.get(run.runtimeId)!
    }
    controller.signal.throwIfAborted()
    const key = `${run.channelId}:${run.purpose}`
    const session = current.sessions[key]
    const result = await adapter.streamTurnFrames(
      {
        prompt: run.prompt,
        resumeSessionId:
          binding.context === 'recent' && session?.audience === run.audience
            ? session.sessionId
            : undefined,
        signal: controller.signal,
        ...(run.purpose === 'extension' ? { outputSchema: extensionSchema } : {})
      },
      (frame) => {
        if (controller.signal.aborted) return
        if (frame.type === 'session') {
          current.sessions[key] = { audience: run.audience, sessionId: frame.sessionId }
          save()
        }
        if (frame.type === 'delta') {
          run.text += frame.text
          if (run.text.length > 128_000)
            controller.abort(
              new Error('Answer exceeded the 128,000-character limit. Ask for a smaller result.')
            )
          broadcast()
        }
        if (frame.type === 'tool_call' || frame.type === 'permission_request')
          controller.abort(
            new Error(
              'The provider attempted a tool call in reply mode. Reconnect or report this runtime.'
            )
          )
      }
    )
    controller.signal.throwIfAborted()
    if ((await boundary(binding)) !== run.audience || !binding.enabled)
      throw new Error('Audience changed; this result cannot be published.')
    if (result.text.length > 128_000) throw new Error('Answer exceeds the saved-answer limit.')
    run.text = result.text
    run.status = 'completed'
  } catch (cause) {
    run.status = controller.signal.aborted ? 'cancelled' : 'failed'
    run.error = detail(controller.signal.reason ?? cause)
    if (/OAuth|authenticate|[Ss]ign in/.test(run.error)) {
      const runtime = current.runtimes.find((entry) => entry.id === run.runtimeId)
      if (runtime) {
        runtime.state = 'sign-in-required'
        runtime.detail = `${run.error}. Sign in to ${run.provider} in your terminal, then reconnect.`
      }
      adapters.delete(run.runtimeId)
    }
    // A failed/partial turn must not silently contaminate the next provider context.
    delete current.sessions[`${run.channelId}:${run.purpose}`]
  } finally {
    clearTimeout(timeout)
    clearInterval(guard)
    controllers.delete(run.id)
    run.finishedAt = Date.now()
    broadcast(true)
  }
}
async function start(
  input: Parameters<CommunityAgentPort['start']>[0],
  retry?: LocalRun
): Promise<string> {
  const current = load()
  if (
    !input ||
    typeof input.channelId !== 'string' ||
    typeof input.messageId !== 'string' ||
    !Array.isArray(input.contextIds) ||
    input.contextIds.length > 30 ||
    input.contextIds.some((id) => typeof id !== 'string') ||
    !['reply', 'extension'].includes(input.purpose)
  )
    throw new Error('Invalid agent request')
  if (!retry) {
    const existing = current.runs.find((run) => run.messageId === input.messageId)
    if (existing) return existing.id
  }
  if (current.runs.some((run) => run.status === 'running'))
    throw new Error('Another local agent is working. Stop it or wait for it to finish.')
  if (current.runs.filter((run) => Date.now() - run.startedAt < 3600_000).length >= 60)
    throw new Error('The local limit is 60 agent requests per hour.')
  const binding = current.bindings.find(
    (entry) => entry.channelId === input.channelId && entry.enabled
  )
  if (!binding) throw new Error('Connect an agent to this conversation first.')
  const runtime = current.runtimes.find((entry) => entry.id === binding.runtimeId)
  if (!runtime || !['ready', 'available'].includes(runtime.state))
    throw new Error(runtime?.detail ?? 'This runtime is unavailable.')
  const audience = await boundary(binding)
  if (retry && retry.audience !== audience)
    throw new Error(
      'The audience or policy changed. Send a new message instead of retrying old context.'
    )
  const message = await getNode(input.messageId)
  if (!message) throw new Error('The message is unavailable.')
  const context =
    binding.context === 'recent'
      ? await Promise.all(
          [...new Set(input.contextIds)].map(async (id) => {
            const node = await getNode(id)
            if (!node) throw new Error('A selected context message is unavailable.')
            return node
          })
        )
      : []
  const prompt = buildAgentPrompt({
    message,
    context,
    channelId: input.channelId,
    owner: current.owner,
    now: Date.now(),
    retry: !!retry
  })
  const id = randomUUID()
  const run: LocalRun = {
    id,
    channelId: input.channelId,
    messageId: input.messageId,
    replyId: `agent-reply-${id}`,
    owner: current.owner,
    provider: runtime.provider,
    runtimeId: runtime.id,
    runtimeVersion: runtime.version,
    model: runtime.model,
    status: 'running',
    text: '',
    startedAt: Date.now(),
    contextCount: retry?.contextCount ?? prompt.count,
    published: false,
    purpose: input.purpose,
    audience,
    prompt:
      retry?.prompt ?? prompt.prompt + (input.purpose === 'extension' ? extensionInstructions : '')
  }
  current.runs.push(run)
  broadcast(true)
  void execute(run, binding)
  return id
}
function trusted(event: IpcMainInvokeEvent) {
  const window = hostWindow?.()
  if (
    !window ||
    window.webContents !== event.sender ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('Agent controls are only available in the main xNet window.')
}
export function setupCommunityAgentIPC(getWindow: () => BrowserWindow | null) {
  hostWindow = getWindow
  setupStoreResponseHandler()
  const handle = (name: string, fn: (input: never) => unknown) =>
    ipcMain.handle(`xnet:community-agents:${name}`, (event, input) => {
      trusted(event)
      // Serialize decisions before accepting a run; streaming happens outside this queue.
      const result = serial.then(() => fn(input as never))
      serial = result.then(
        () => {},
        () => {}
      )
      return result
    })
  handle('snapshot', () => snapshot())
  handle('discover', async () => {
    const current = load()
    current.runtimes = await discoverCommunityRuntimes()
    adapters.clear()
    broadcast(true)
    return current.runtimes
  })
  handle('connect', (id: string) => connect(id))
  handle('bind', async (binding: CommunityAgentBinding) => {
    if (
      !binding ||
      typeof binding.channelId !== 'string' ||
      typeof binding.runtimeId !== 'string' ||
      !['direct', 'mentions'].includes(binding.mode) ||
      !['question', 'recent'].includes(binding.context) ||
      typeof binding.enabled !== 'boolean'
    )
      throw new Error('Invalid agent binding')
    const current = load()
    const runtime = current.runtimes.find(
      (entry) => entry.id === binding.runtimeId && entry.state === 'ready'
    )
    if (!runtime || binding.provider !== runtime.provider)
      throw new Error('Connect this runtime before enabling it.')
    await boundary(binding)
    for (const run of current.runs)
      if (run.channelId === binding.channelId)
        controllers.get(run.id)?.abort(new Error('Agent settings changed.'))
    current.bindings = [
      ...current.bindings.filter((entry) => entry.channelId !== binding.channelId),
      { ...binding }
    ]
    delete current.sessions[`${binding.channelId}:reply`]
    delete current.sessions[`${binding.channelId}:extension`]
    broadcast(true)
  })
  handle('start', (input: Parameters<CommunityAgentPort['start']>[0]) => start(input))
  handle('cancel', (id: string) => {
    controllers.get(id)?.abort(new Error('Stopped by you.'))
  })
  handle('retry', (id: string) => {
    const run = load().runs.find((entry) => entry.id === id)
    if (!run || !['failed', 'cancelled', 'interrupted'].includes(run.status))
      throw new Error('Only an unsuccessful run can be retried.')
    return start(
      { channelId: run.channelId, messageId: run.messageId, contextIds: [], purpose: run.purpose },
      run
    )
  })
  handle('authorizePublication', async (id: string) => {
    const run = load().runs.find((entry) => entry.id === id)
    if (!run || run.status !== 'completed') throw new Error('No completed run to publish.')
    const binding = load().bindings.find((entry) => entry.channelId === run.channelId)
    if (!binding || !binding.enabled || (await boundary(binding)) !== run.audience)
      throw new Error('Audience changed. This result cannot be published.')
  })
  handle('acknowledge', async (id: string) => {
    const run = load().runs.find((entry) => entry.id === id)
    if (!run || run.status !== 'completed') throw new Error('No completed run to publish.')
    const binding = load().bindings.find((entry) => entry.channelId === run.channelId)
    if (!binding || !binding.enabled || (await boundary(binding)) !== run.audience)
      throw new Error('Audience changed. This result cannot be published.')
    const reply = await getNode(run.replyId)
    if (!reply || reply.createdBy !== run.owner || reply.properties.channel !== run.channelId)
      throw new Error('Save the attributed reply before acknowledging it.')
    run.published = true
    broadcast(true)
  })
  handle('reset', (channelId: string) => {
    for (const run of load().runs)
      if (run.channelId === channelId)
        controllers.get(run.id)?.abort(new Error('Context reset by you.'))
    delete load().sessions[`${channelId}:reply`]
    delete load().sessions[`${channelId}:extension`]
    broadcast(true)
  })
}
export function stopCommunityAgents() {
  for (const controller of controllers.values()) controller.abort(new Error('xNet is closing.'))
  save()
}
