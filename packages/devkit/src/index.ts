/**
 * @xnetjs/devkit — the agentic dev-loop core (exploration 0190).
 *
 * Productizes the "AI-coding-agent-in-a-git-worktree" loop: isolate in a git
 * worktree, let a bring-your-own coding agent edit, run a validation gate, then
 * checkpoint (a restore point) or roll back. Injectable command runner, zero
 * runtime dependencies — the verifiable spine that the Electron bridge daemon,
 * the web WebContainers surface, and the remote-sandbox tier all build on.
 */

export {
  NodeCommandRunner,
  FakeCommandRunner,
  NodeLineRunner,
  FakeLineRunner,
  cmd,
  type CommandRunner,
  type CommandResult,
  type RunOptions,
  type FakeCommandScript,
  type LineRunner,
  type StreamRunOptions,
  type FakeLineScript
} from './command-runner'

export { Git, GitError, type GitCheckpoint } from './git'

export {
  runValidationGate,
  defaultXnetGate,
  type ValidationStep,
  type StepResult,
  type GateResult
} from './validation-gate'

export {
  cliAgentRunner,
  fakeAgentRunner,
  type AgentRunner,
  type AgentTask,
  type AgentResult,
  type CliAgentOptions
} from './agent'

export {
  runAgentTask,
  openPullRequest,
  publishPluginRepo,
  type RunAgentTaskOptions,
  type AgentTaskResult,
  type OpenPullRequestOptions,
  type PublishPluginRepoOptions
} from './dev-loop'

export {
  bridgeHealth,
  handleBridgeRun,
  type BridgeHealthPayload,
  type BridgeDeps,
  type BridgeRunRequest
} from './bridge'

export {
  cliChatAgent,
  cliStreamingChatAgent,
  isStreamingChatAgent,
  isFramedChatAgent,
  fakeChatAgent,
  openAiChatAgent,
  flattenChat,
  reduceStreamJsonLine,
  initialStreamJsonState,
  type ChatAgent,
  type ChatMessage,
  type CliChatAgentOptions,
  type CliStreamingChatAgentOptions,
  type OpenAiChatAgentOptions,
  type StreamingChatAgent,
  type FramedChatAgent,
  type StreamTurnRequest,
  type StreamTurnResult,
  type StreamJsonState
} from './chat-agent'

export {
  foldStreamJsonFrames,
  initialStreamJsonFrameState,
  AGENT_FRAME_TYPES,
  type AgentFrame,
  type StreamJsonFrameState
} from './agent-frames'

export {
  createBridgeSessionStore,
  fileSessionPersistence,
  transcriptKey,
  type BridgeSessionStore,
  type BridgeSessionStoreOptions,
  type SessionPersistence,
  type BridgeTurnPlan
} from './bridge-sessions'

export {
  createBridgeServer,
  DEFAULT_BRIDGE_PORT,
  type BridgeServerConfig,
  type BridgeServerHandle
} from './bridge-server'

export {
  buildAgentArgs,
  buildStreamingAgentArgs,
  mcpConfigFor,
  DEFAULT_XNET_ALLOWED_TOOLS,
  XNET_READONLY_ALLOWED_TOOLS,
  type AgentLaunchOptions,
  type McpServerSpec
} from './agent-launch'
