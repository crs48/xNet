/**
 * In-app AI agent runtime for persistent threads, approvals, events, and telemetry.
 */

import type {
  AIGenerateRequest,
  AIGenerateResponse,
  AIProvider,
  AIStreamChunk,
  AIToolCall,
  AIUsage
} from './providers'
import type { AiMutationPlan, AiRiskLevel, AiScope } from '../ai-surface'

// ─── Types ─────────────────────────────────────────────────────────────────

export type AiAgentOrchestratorMode = 'custom' | 'codex-app-server' | 'hybrid'

export type AiAgentThreadStatus = 'idle' | 'running' | 'waiting-approval' | 'cancelled' | 'failed'

export type AiAgentTurnRole = 'system' | 'user' | 'assistant' | 'tool'

export type AiAgentTurnStatus = 'pending' | 'streaming' | 'completed' | 'cancelled' | 'failed'

export type AiAgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision-requested'

export type AiAgentBackgroundJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AiAgentEventType =
  | 'thread.created'
  | 'turn.created'
  | 'model.delta'
  | 'model.completed'
  | 'tool.call'
  | 'usage'
  | 'approval.requested'
  | 'approval.resolved'
  | 'run.cancelled'
  | 'run.completed'
  | 'run.failed'
  | 'run.steered'
  | 'background.started'
  | 'background.completed'
  | 'background.failed'
  | 'background.cancelled'

export type AiAgentThread = {
  id: string
  title: string
  mode: AiAgentOrchestratorMode
  status: AiAgentThreadStatus
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export type AiAgentTurn = {
  id: string
  threadId: string
  role: AiAgentTurnRole
  status: AiAgentTurnStatus
  content: string
  createdAt: string
  updatedAt: string
  provider?: string
  model?: string
  usage?: AIUsage
  toolCalls?: AIToolCall[]
  error?: string
  metadata?: Record<string, unknown>
}

export type AiAgentApproval = {
  id: string
  threadId: string
  turnId?: string
  planId: string
  risk: AiRiskLevel
  requiredScopes: AiScope[]
  status: AiAgentApprovalStatus
  createdAt: string
  resolvedAt?: string
  note?: string
  plan: AiMutationPlan
}

export type AiAgentBackgroundJob = {
  id: string
  kind: 'export' | 'analysis' | 'custom'
  title: string
  status: AiAgentBackgroundJobStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  result?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

export type AiAgentEvent = {
  id: string
  threadId?: string
  turnId?: string
  type: AiAgentEventType
  createdAt: string
  payload: Record<string, unknown>
}

export type AiAgentTelemetrySnapshot = {
  runsStarted: number
  runsCompleted: number
  runsCancelled: number
  runsFailed: number
  totalLatencyMs: number
  lastLatencyMs?: number
  acceptedChanges: number
  rejectedChanges: number
  revisionRequests: number
  toolFailures: number
  backgroundJobsStarted: number
  backgroundJobsCompleted: number
  backgroundJobsFailed: number
}

export type AiAgentRuntimeSnapshot = {
  threads: AiAgentThread[]
  turns: AiAgentTurn[]
  approvals: AiAgentApproval[]
  backgroundJobs: AiAgentBackgroundJob[]
  events: AiAgentEvent[]
  telemetry: AiAgentTelemetrySnapshot
}

export type AiAgentRuntimeStorage = {
  load(): Promise<AiAgentRuntimeSnapshot | null>
  save(snapshot: AiAgentRuntimeSnapshot): Promise<void>
}

export type AiAgentRuntimeConfig = {
  provider: AIProvider
  storage?: AiAgentRuntimeStorage
  clock?: () => Date
  mode?: AiAgentOrchestratorMode
  maxEvents?: number
}

export type AiAgentThreadCreateInput = {
  title: string
  mode?: AiAgentOrchestratorMode
  metadata?: Record<string, unknown>
}

export type AiAgentRunTurnInput = {
  threadId: string
  content: string
  request?: Omit<AIGenerateRequest, 'prompt' | 'messages'>
  metadata?: Record<string, unknown>
}

export type AiAgentSelectionKind = 'page-text' | 'database-rows' | 'canvas-objects' | 'nodes'

export type AiAgentSelectionContext = {
  kind: AiAgentSelectionKind
  label?: string
  pageId?: string
  databaseId?: string
  canvasId?: string
  nodeIds?: string[]
  rowIds?: string[]
  objectIds?: string[]
  text?: string
  range?: { from: number; to: number }
}

export type AiAgentRunSelectionTurnInput = Omit<AiAgentRunTurnInput, 'content'> & {
  instruction: string
  selection: AiAgentSelectionContext
}

export type AiAgentRunTurnResult = {
  runId: string
  userTurn: AiAgentTurn
  assistantTurn: AiAgentTurn
}

export type AiAgentApprovalRequestInput = {
  threadId: string
  turnId?: string
  plan: AiMutationPlan
}

export type AiAgentApprovalResolveInput = {
  approvalId: string
  status: Exclude<AiAgentApprovalStatus, 'pending'>
  note?: string
}

export type AiAgentBackgroundJobInput = {
  kind: AiAgentBackgroundJob['kind']
  title: string
  metadata?: Record<string, unknown>
}

export type AiAgentBackgroundJobRunner = (signal: AbortSignal) => Promise<unknown>

export type AiAgentRuntimeListener = (event: AiAgentEvent, snapshot: AiAgentRuntimeSnapshot) => void

export type AiAgentDisplayStateKind = 'read-only-answer' | 'proposed-change' | 'applied-change'

export type AiAgentDisplayState = {
  kind: AiAgentDisplayStateKind
  label: string
  planId?: string
  approvalId?: string
  auditEventId?: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_EVENTS = 500

const EMPTY_TELEMETRY: AiAgentTelemetrySnapshot = {
  runsStarted: 0,
  runsCompleted: 0,
  runsCancelled: 0,
  runsFailed: 0,
  totalLatencyMs: 0,
  acceptedChanges: 0,
  rejectedChanges: 0,
  revisionRequests: 0,
  toolFailures: 0,
  backgroundJobsStarted: 0,
  backgroundJobsCompleted: 0,
  backgroundJobsFailed: 0
}

// ─── Runtime ────────────────────────────────────────────────────────────────

export class AiAgentRuntime {
  private snapshot: AiAgentRuntimeSnapshot = createEmptySnapshot()
  private readonly storage: AiAgentRuntimeStorage
  private readonly clock: () => Date
  private readonly mode: AiAgentOrchestratorMode
  private readonly maxEvents: number
  private sequence = 0
  private loaded = false
  private readonly listeners = new Set<AiAgentRuntimeListener>()
  private readonly activeRuns = new Map<string, AbortController>()
  private readonly activeJobs = new Map<string, AbortController>()

  constructor(private readonly config: AiAgentRuntimeConfig) {
    this.storage = config.storage ?? createMemoryAiAgentRuntimeStorage()
    this.clock = config.clock ?? (() => new Date())
    this.mode = config.mode ?? 'hybrid'
    this.maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS
  }

  async load(): Promise<AiAgentRuntimeSnapshot> {
    const stored = await this.storage.load()
    this.snapshot = normalizeSnapshot(stored)
    this.loaded = true
    return this.getSnapshot()
  }

  getSnapshot(): AiAgentRuntimeSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  subscribe(listener: AiAgentRuntimeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async createThread(input: AiAgentThreadCreateInput): Promise<AiAgentThread> {
    await this.ensureLoaded()
    const now = this.nowIso()
    const thread: AiAgentThread = {
      id: this.nextId('thread'),
      title: input.title,
      mode: input.mode ?? this.mode,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      ...(input.metadata ? { metadata: input.metadata } : {})
    }

    this.snapshot = {
      ...this.snapshot,
      threads: [...this.snapshot.threads, thread]
    }
    await this.emit('thread.created', { threadId: thread.id, mode: thread.mode }, thread.id)
    return thread
  }

  async runTurn(input: AiAgentRunTurnInput): Promise<AiAgentRunTurnResult> {
    await this.ensureLoaded()
    const thread = this.getThreadOrThrow(input.threadId)
    const now = this.nowIso()
    const runId = this.nextId('run')
    const controller = new AbortController()
    const userTurn = this.createTurn({
      threadId: thread.id,
      role: 'user',
      status: 'completed',
      content: input.content,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata
    })
    const assistantTurn = this.createTurn({
      threadId: thread.id,
      role: 'assistant',
      status: this.config.provider.stream ? 'streaming' : 'pending',
      content: '',
      createdAt: now,
      updatedAt: now,
      metadata: { runId }
    })

    this.activeRuns.set(runId, controller)
    this.snapshot = {
      ...this.snapshot,
      telemetry: {
        ...this.snapshot.telemetry,
        runsStarted: this.snapshot.telemetry.runsStarted + 1
      }
    }
    await this.updateThread(thread.id, { status: 'running', updatedAt: now })
    await this.emit('turn.created', { turnId: userTurn.id, role: 'user' }, thread.id, userTurn.id)
    await this.emit(
      'turn.created',
      { turnId: assistantTurn.id, role: 'assistant', runId },
      thread.id,
      assistantTurn.id
    )

    void this.completeRun({
      runId,
      threadId: thread.id,
      assistantTurnId: assistantTurn.id,
      content: input.content,
      request: input.request,
      signal: controller.signal,
      startedAt: Date.parse(now)
    })

    return { runId, userTurn, assistantTurn }
  }

  async runSelectionTurn(input: AiAgentRunSelectionTurnInput): Promise<AiAgentRunTurnResult> {
    return await this.runTurn({
      threadId: input.threadId,
      content: renderSelectionPrompt(input.instruction, input.selection),
      request: input.request,
      metadata: {
        ...input.metadata,
        selection: input.selection,
        entryPoint: 'current-selection'
      }
    })
  }

  async cancelRun(runId: string): Promise<boolean> {
    await this.ensureLoaded()
    const controller = this.activeRuns.get(runId)
    if (!controller) return false
    controller.abort()
    return true
  }

  async steerRun(runId: string, message: string): Promise<boolean> {
    await this.ensureLoaded()
    const active = this.activeRuns.has(runId)
    if (!active) return false
    await this.emit('run.steered', { runId, message })
    return true
  }

  async requestApproval(input: AiAgentApprovalRequestInput): Promise<AiAgentApproval> {
    await this.ensureLoaded()
    const thread = this.getThreadOrThrow(input.threadId)
    const approval: AiAgentApproval = {
      id: this.nextId('approval'),
      threadId: thread.id,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      planId: input.plan.id,
      risk: input.plan.risk,
      requiredScopes: [...input.plan.requiredScopes],
      status: 'pending',
      createdAt: this.nowIso(),
      plan: input.plan
    }

    this.snapshot = {
      ...this.snapshot,
      approvals: [...this.snapshot.approvals, approval]
    }
    await this.updateThread(thread.id, {
      status: 'waiting-approval',
      updatedAt: approval.createdAt
    })
    await this.emit(
      'approval.requested',
      {
        approvalId: approval.id,
        planId: approval.planId,
        risk: approval.risk,
        requiredScopes: approval.requiredScopes
      },
      thread.id,
      input.turnId
    )
    return approval
  }

  async resolveApproval(input: AiAgentApprovalResolveInput): Promise<AiAgentApproval> {
    await this.ensureLoaded()
    const approval = this.snapshot.approvals.find((item) => item.id === input.approvalId)
    if (!approval) throw new Error(`AI approval not found: ${input.approvalId}`)
    if (approval.status !== 'pending') return approval

    const resolved: AiAgentApproval = {
      ...approval,
      status: input.status,
      resolvedAt: this.nowIso(),
      ...(input.note ? { note: input.note } : {})
    }
    this.snapshot = {
      ...this.snapshot,
      approvals: this.snapshot.approvals.map((item) => (item.id === resolved.id ? resolved : item)),
      telemetry: telemetryForApproval(this.snapshot.telemetry, input.status)
    }
    await this.updateThread(approval.threadId, { status: 'idle', updatedAt: resolved.resolvedAt })
    await this.emit(
      'approval.resolved',
      {
        approvalId: resolved.id,
        planId: resolved.planId,
        status: resolved.status,
        note: resolved.note ?? ''
      },
      resolved.threadId,
      resolved.turnId
    )
    return resolved
  }

  async startBackgroundJob(
    input: AiAgentBackgroundJobInput,
    runner: AiAgentBackgroundJobRunner
  ): Promise<AiAgentBackgroundJob> {
    await this.ensureLoaded()
    const now = this.nowIso()
    const job: AiAgentBackgroundJob = {
      id: this.nextId('job'),
      kind: input.kind,
      title: input.title,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      ...(input.metadata ? { metadata: input.metadata } : {})
    }
    const controller = new AbortController()
    this.activeJobs.set(job.id, controller)
    this.snapshot = {
      ...this.snapshot,
      backgroundJobs: [...this.snapshot.backgroundJobs, job],
      telemetry: {
        ...this.snapshot.telemetry,
        backgroundJobsStarted: this.snapshot.telemetry.backgroundJobsStarted + 1
      }
    }
    await this.emit('background.started', { jobId: job.id, kind: job.kind, title: job.title })

    void this.completeBackgroundJob(job.id, runner, controller.signal)
    return job
  }

  async cancelBackgroundJob(jobId: string): Promise<boolean> {
    await this.ensureLoaded()
    const controller = this.activeJobs.get(jobId)
    if (!controller) return false
    controller.abort()
    return true
  }

  private async completeRun(input: {
    runId: string
    threadId: string
    assistantTurnId: string
    content: string
    request?: Omit<AIGenerateRequest, 'prompt' | 'messages'>
    signal: AbortSignal
    startedAt: number
  }): Promise<void> {
    try {
      const request = createGenerateRequest(input.content, input.request)
      if (this.config.provider.stream) {
        await this.completeStreamingRun(input, request)
      } else {
        const response = await this.config.provider.generateWithTools?.(request)
        if (response) {
          await this.applyGenerateResponse(input, response)
        } else {
          const text = await this.config.provider.generate(input.content)
          await this.appendAssistantText(input.threadId, input.assistantTurnId, text)
        }
      }
      await this.finishRun(input, 'completed')
    } catch (err) {
      if (input.signal.aborted) {
        await this.finishRun(input, 'cancelled')
        return
      }
      await this.failRun(input, err)
    } finally {
      this.activeRuns.delete(input.runId)
    }
  }

  private async completeStreamingRun(
    input: {
      runId: string
      threadId: string
      assistantTurnId: string
      signal: AbortSignal
    },
    request: AIGenerateRequest
  ): Promise<void> {
    if (!this.config.provider.stream) return

    for await (const chunk of this.config.provider.stream({ ...request, stream: true })) {
      if (input.signal.aborted) throw new Error('Run cancelled')
      await this.applyStreamChunk(input.threadId, input.assistantTurnId, chunk)
    }
  }

  private async applyGenerateResponse(
    input: { threadId: string; assistantTurnId: string },
    response: AIGenerateResponse
  ): Promise<void> {
    await this.updateTurn(input.assistantTurnId, {
      content: response.text,
      provider: response.provider,
      model: response.model,
      status: 'completed',
      usage: response.usage,
      ...(response.toolCalls ? { toolCalls: response.toolCalls } : {}),
      updatedAt: this.nowIso()
    })
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        await this.emit('tool.call', { toolCall }, input.threadId, input.assistantTurnId)
      }
    }
    if (response.usage) {
      await this.emit('usage', { usage: response.usage }, input.threadId, input.assistantTurnId)
    }
  }

  private async applyStreamChunk(
    threadId: string,
    turnId: string,
    chunk: AIStreamChunk
  ): Promise<void> {
    if (chunk.type === 'text') {
      await this.appendAssistantText(threadId, turnId, chunk.text, chunk.provider, chunk.model)
      return
    }
    if (chunk.type === 'tool_call') {
      await this.appendToolCall(turnId, chunk.toolCall)
      await this.emit('tool.call', { toolCall: chunk.toolCall }, threadId, turnId)
      return
    }
    if (chunk.type === 'usage') {
      await this.updateTurn(turnId, { usage: chunk.usage, updatedAt: this.nowIso() })
      await this.emit('usage', { usage: chunk.usage }, threadId, turnId)
      return
    }
    await this.emit(
      'model.completed',
      { provider: chunk.provider, model: chunk.model },
      threadId,
      turnId
    )
  }

  private async appendAssistantText(
    threadId: string,
    turnId: string,
    text: string,
    provider?: string,
    model?: string
  ): Promise<void> {
    const turn = this.getTurnOrThrow(turnId)
    await this.updateTurn(turnId, {
      content: `${turn.content}${text}`,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      updatedAt: this.nowIso()
    })
    if (text) {
      await this.emit('model.delta', { text }, threadId, turnId)
    }
  }

  private async appendToolCall(turnId: string, toolCall: AIToolCall): Promise<void> {
    const turn = this.getTurnOrThrow(turnId)
    await this.updateTurn(turnId, {
      toolCalls: [...(turn.toolCalls ?? []), toolCall],
      updatedAt: this.nowIso()
    })
  }

  private async finishRun(
    input: { runId: string; threadId: string; assistantTurnId: string; startedAt: number },
    status: 'completed' | 'cancelled'
  ): Promise<void> {
    const now = this.nowIso()
    const latencyMs = Math.max(0, Date.parse(now) - input.startedAt)
    await this.updateTurn(input.assistantTurnId, {
      status: status === 'completed' ? 'completed' : 'cancelled',
      updatedAt: now
    })
    await this.updateThread(input.threadId, {
      status: status === 'completed' ? 'idle' : 'cancelled',
      updatedAt: now
    })
    this.snapshot = {
      ...this.snapshot,
      telemetry: telemetryForRun(this.snapshot.telemetry, status, latencyMs)
    }
    await this.emit(
      status === 'completed' ? 'run.completed' : 'run.cancelled',
      { runId: input.runId, latencyMs },
      input.threadId,
      input.assistantTurnId
    )
  }

  private async failRun(
    input: { runId: string; threadId: string; assistantTurnId: string; startedAt: number },
    err: unknown
  ): Promise<void> {
    const now = this.nowIso()
    const message = err instanceof Error ? err.message : String(err)
    const latencyMs = Math.max(0, Date.parse(now) - input.startedAt)
    await this.updateTurn(input.assistantTurnId, {
      status: 'failed',
      error: message,
      updatedAt: now
    })
    await this.updateThread(input.threadId, { status: 'failed', updatedAt: now })
    this.snapshot = {
      ...this.snapshot,
      telemetry: {
        ...telemetryForRun(this.snapshot.telemetry, 'failed', latencyMs),
        toolFailures: this.snapshot.telemetry.toolFailures + 1
      }
    }
    await this.emit(
      'run.failed',
      { runId: input.runId, error: message, latencyMs },
      input.threadId,
      input.assistantTurnId
    )
  }

  private async completeBackgroundJob(
    jobId: string,
    runner: AiAgentBackgroundJobRunner,
    signal: AbortSignal
  ): Promise<void> {
    try {
      const result = await runner(signal)
      if (signal.aborted) {
        await this.finishBackgroundJob(jobId, 'cancelled')
        return
      }
      await this.finishBackgroundJob(jobId, 'completed', result)
    } catch (err) {
      if (signal.aborted) {
        await this.finishBackgroundJob(jobId, 'cancelled')
      } else {
        await this.failBackgroundJob(jobId, err)
      }
    } finally {
      this.activeJobs.delete(jobId)
    }
  }

  private async finishBackgroundJob(
    jobId: string,
    status: 'completed' | 'cancelled',
    result?: unknown
  ): Promise<void> {
    const now = this.nowIso()
    await this.updateJob(jobId, {
      status,
      updatedAt: now,
      completedAt: now,
      ...(result !== undefined ? { result } : {})
    })
    if (status === 'completed') {
      this.snapshot = {
        ...this.snapshot,
        telemetry: {
          ...this.snapshot.telemetry,
          backgroundJobsCompleted: this.snapshot.telemetry.backgroundJobsCompleted + 1
        }
      }
    }
    await this.emit(status === 'completed' ? 'background.completed' : 'background.cancelled', {
      jobId
    })
  }

  private async failBackgroundJob(jobId: string, err: unknown): Promise<void> {
    const now = this.nowIso()
    const message = err instanceof Error ? err.message : String(err)
    await this.updateJob(jobId, {
      status: 'failed',
      updatedAt: now,
      completedAt: now,
      error: message
    })
    this.snapshot = {
      ...this.snapshot,
      telemetry: {
        ...this.snapshot.telemetry,
        backgroundJobsFailed: this.snapshot.telemetry.backgroundJobsFailed + 1,
        toolFailures: this.snapshot.telemetry.toolFailures + 1
      }
    }
    await this.emit('background.failed', { jobId, error: message })
  }

  private createTurn(input: Omit<AiAgentTurn, 'id'>): AiAgentTurn {
    const turn: AiAgentTurn = { ...input, id: this.nextId('turn') }
    this.snapshot = {
      ...this.snapshot,
      turns: [...this.snapshot.turns, turn]
    }
    return turn
  }

  private async updateThread(
    threadId: string,
    patch: Partial<Omit<AiAgentThread, 'id'>>
  ): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      threads: this.snapshot.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread
      )
    }
    await this.persist()
  }

  private async updateTurn(turnId: string, patch: Partial<Omit<AiAgentTurn, 'id'>>): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      turns: this.snapshot.turns.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn))
    }
    await this.persist()
  }

  private async updateJob(
    jobId: string,
    patch: Partial<Omit<AiAgentBackgroundJob, 'id'>>
  ): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      backgroundJobs: this.snapshot.backgroundJobs.map((job) =>
        job.id === jobId ? { ...job, ...patch } : job
      )
    }
    await this.persist()
  }

  private async emit(
    type: AiAgentEventType,
    payload: Record<string, unknown>,
    threadId?: string,
    turnId?: string
  ): Promise<void> {
    const event: AiAgentEvent = {
      id: this.nextId('event'),
      ...(threadId ? { threadId } : {}),
      ...(turnId ? { turnId } : {}),
      type,
      createdAt: this.nowIso(),
      payload
    }
    this.snapshot = {
      ...this.snapshot,
      events: [...this.snapshot.events, event].slice(-this.maxEvents)
    }
    await this.persist()
    const nextSnapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(event, nextSnapshot))
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.getSnapshot())
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load()
    }
  }

  private getThreadOrThrow(threadId: string): AiAgentThread {
    const thread = this.snapshot.threads.find((item) => item.id === threadId)
    if (!thread) throw new Error(`AI thread not found: ${threadId}`)
    return thread
  }

  private getTurnOrThrow(turnId: string): AiAgentTurn {
    const turn = this.snapshot.turns.find((item) => item.id === turnId)
    if (!turn) throw new Error(`AI turn not found: ${turnId}`)
    return turn
  }

  private nowIso(): string {
    return this.clock().toISOString()
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}_${this.sequence.toString(36)}`
  }
}

// ─── Factories ──────────────────────────────────────────────────────────────

export function createAiAgentRuntime(config: AiAgentRuntimeConfig): AiAgentRuntime {
  return new AiAgentRuntime(config)
}

export function createMemoryAiAgentRuntimeStorage(
  initial?: AiAgentRuntimeSnapshot
): AiAgentRuntimeStorage & { snapshot(): AiAgentRuntimeSnapshot } {
  let current = normalizeSnapshot(initial)

  return {
    load: async () => cloneSnapshot(current),
    save: async (snapshot) => {
      current = cloneSnapshot(snapshot)
    },
    snapshot: () => cloneSnapshot(current)
  }
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

export function renderSelectionPrompt(
  instruction: string,
  selection: AiAgentSelectionContext
): string {
  const lines = [
    instruction.trim(),
    '',
    'Current xNet selection:',
    `- kind: ${selection.kind}`,
    ...(selection.label ? [`- label: ${selection.label}`] : []),
    ...(selection.pageId ? [`- pageId: ${selection.pageId}`] : []),
    ...(selection.databaseId ? [`- databaseId: ${selection.databaseId}`] : []),
    ...(selection.canvasId ? [`- canvasId: ${selection.canvasId}`] : []),
    ...(selection.nodeIds?.length ? [`- nodeIds: ${selection.nodeIds.join(', ')}`] : []),
    ...(selection.rowIds?.length ? [`- rowIds: ${selection.rowIds.join(', ')}`] : []),
    ...(selection.objectIds?.length ? [`- objectIds: ${selection.objectIds.join(', ')}`] : []),
    ...(selection.range ? [`- range: ${selection.range.from}-${selection.range.to}`] : []),
    ...(selection.text ? ['', 'Selected text:', selection.text] : [])
  ]

  return lines.join('\n')
}

export function classifyAiAgentDisplayState(input: {
  plan?: AiMutationPlan
  approval?: AiAgentApproval
  auditEventId?: string
}): AiAgentDisplayState {
  if (input.auditEventId || input.plan?.status === 'applied') {
    return {
      kind: 'applied-change',
      label: 'Applied change',
      ...(input.plan?.id ? { planId: input.plan.id } : {}),
      ...(input.approval?.id ? { approvalId: input.approval.id } : {}),
      ...(input.auditEventId ? { auditEventId: input.auditEventId } : {})
    }
  }

  if (input.plan || input.approval) {
    return {
      kind: 'proposed-change',
      label: 'Proposed change',
      ...(input.plan?.id ? { planId: input.plan.id } : {}),
      ...(input.approval?.id ? { approvalId: input.approval.id } : {})
    }
  }

  return {
    kind: 'read-only-answer',
    label: 'Read-only answer'
  }
}

function createGenerateRequest(
  content: string,
  request: Omit<AIGenerateRequest, 'prompt' | 'messages'> | undefined
): AIGenerateRequest {
  return {
    ...request,
    messages: [{ role: 'user', content }]
  }
}

function createEmptySnapshot(): AiAgentRuntimeSnapshot {
  return {
    threads: [],
    turns: [],
    approvals: [],
    backgroundJobs: [],
    events: [],
    telemetry: { ...EMPTY_TELEMETRY }
  }
}

function normalizeSnapshot(
  snapshot: AiAgentRuntimeSnapshot | null | undefined
): AiAgentRuntimeSnapshot {
  if (!snapshot) return createEmptySnapshot()

  return {
    threads: [...snapshot.threads],
    turns: [...snapshot.turns],
    approvals: [...snapshot.approvals],
    backgroundJobs: [...snapshot.backgroundJobs],
    events: [...snapshot.events],
    telemetry: {
      ...EMPTY_TELEMETRY,
      ...snapshot.telemetry
    }
  }
}

function cloneSnapshot(snapshot: AiAgentRuntimeSnapshot): AiAgentRuntimeSnapshot {
  return {
    threads: snapshot.threads.map((thread) => ({ ...thread })),
    turns: snapshot.turns.map((turn) => ({ ...turn })),
    approvals: snapshot.approvals.map((approval) => ({
      ...approval,
      requiredScopes: [...approval.requiredScopes]
    })),
    backgroundJobs: snapshot.backgroundJobs.map((job) => ({ ...job })),
    events: snapshot.events.map((event) => ({ ...event, payload: { ...event.payload } })),
    telemetry: { ...snapshot.telemetry }
  }
}

function telemetryForRun(
  telemetry: AiAgentTelemetrySnapshot,
  status: 'completed' | 'cancelled' | 'failed',
  latencyMs: number
): AiAgentTelemetrySnapshot {
  return {
    ...telemetry,
    runsCompleted: telemetry.runsCompleted + (status === 'completed' ? 1 : 0),
    runsCancelled: telemetry.runsCancelled + (status === 'cancelled' ? 1 : 0),
    runsFailed: telemetry.runsFailed + (status === 'failed' ? 1 : 0),
    totalLatencyMs: telemetry.totalLatencyMs + latencyMs,
    lastLatencyMs: latencyMs
  }
}

function telemetryForApproval(
  telemetry: AiAgentTelemetrySnapshot,
  status: Exclude<AiAgentApprovalStatus, 'pending'>
): AiAgentTelemetrySnapshot {
  return {
    ...telemetry,
    acceptedChanges: telemetry.acceptedChanges + (status === 'approved' ? 1 : 0),
    rejectedChanges: telemetry.rejectedChanges + (status === 'rejected' ? 1 : 0),
    revisionRequests: telemetry.revisionRequests + (status === 'revision-requested' ? 1 : 0)
  }
}
