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
  cmd,
  type CommandRunner,
  type CommandResult,
  type RunOptions,
  type FakeCommandScript
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
  type RunAgentTaskOptions,
  type AgentTaskResult,
  type OpenPullRequestOptions
} from './dev-loop'
