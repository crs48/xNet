/** Desktop IPC contract. Provider session IDs and credentials never cross this boundary. */
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
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
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
}
export interface CommunityAgentSnapshot {
  runtimes: CommunityAgentRuntime[]
  bindings: CommunityAgentBinding[]
  runs: CommunityAgentRun[]
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
  subscribe(listener: () => void): () => void
}
