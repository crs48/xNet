import type { DevelopmentHistory, DevelopmentRecord } from './extension-development'
/** Desktop IPC contract. Provider session IDs and credentials never cross this boundary. */
export interface CommunityAgentDelegation {
  projectId: string
  channelId: string
  epoch: string
  requesters: string[]
  expiresAt: number
  limit: number
  createdAt: number
}
export type CommunityAgentProvider = 'codex' | 'claude'
export type AgentContextMode = 'question' | 'recent'
export interface CommunityAgentExtension {
  title: string
  summary: string
  source: string
}
export interface CommunityAgentRuntime {
  id: string
  provider: CommunityAgentProvider
  path: string
  version: string
  state: 'available' | 'ready' | 'sign-in-required' | 'unsupported' | 'failed'
  detail: string
  model?: string
}
export interface CommunityAgentBinding {
  channelId: string
  runtimeId: string
  provider: CommunityAgentProvider
  mode: 'direct' | 'mentions'
  context: AgentContextMode
  enabled: boolean
}
export interface CommunityAgentRun {
  id: string
  channelId: string
  messageId: string
  replyId: string
  provider: CommunityAgentProvider
  runtimeVersion: string
  model?: string
  owner: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  text: string
  extension?: CommunityAgentExtension
  baseRevisionId?: string
  baseVersionId?: string
  error?: string
  startedAt: number
  finishedAt?: number
  /** Observed host phases only; optional for journals created before activity reporting. */
  activity?: Array<{
    phase: 'connecting' | 'waiting' | 'replying' | 'drafting' | 'checking'
    at: number
  }>
  contextCount: number
  published: boolean
  purpose: 'reply' | 'extension'
  development?: {
    projectId: string
    requestId: string
    requester: string
    epoch: string
    parents: string[]
    history: DevelopmentHistory
    output?: DevelopmentRecord
  }
}
export interface CommunityAgentSnapshot {
  runtimes: CommunityAgentRuntime[]
  bindings: CommunityAgentBinding[]
  runs: CommunityAgentRun[]
  delegations?: CommunityAgentDelegation[]
}
export interface CommunityAgentPort {
  snapshot(): Promise<CommunityAgentSnapshot>
  discover(): Promise<CommunityAgentRuntime[]>
  connect(runtimeId: string): Promise<CommunityAgentRuntime>
  bind(input: CommunityAgentBinding): Promise<void>
  start(input: {
    channelId: string
    messageId: string
    contextIds: string[]
    extensionRevisionId?: string
  }): Promise<string>
  cancel(runId: string): Promise<void>
  retry(runId: string): Promise<string>
  authorizePublication(runId: string): Promise<void>
  acknowledge(runId: string): Promise<void>
  reset(channelId: string): Promise<void>
  delegate(input: {
    projectId: string
    channelId: string
    requesters: string[]
    expiresAt: number
    limit: number
  }): Promise<CommunityAgentDelegation>
  revokeDelegation(projectId: string): Promise<void>
  startDevelopment(input: { requestId: string; retry?: boolean }): Promise<string>
  authorizeDevelopmentActivity(runId: string): Promise<void>
  subscribe(listener: () => void): () => void
}
