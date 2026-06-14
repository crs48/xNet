/**
 * @xnetjs/cloud/ai — public API.
 *
 * Managed AI gateway for the fleet (explorations 0148/0175/0176): an
 * OpenAI-compatible client, a budget-guarded + metered wrapper, the usage→billing
 * bridge, and a sandboxed agent-safety harness. All testable with no provider keys.
 */

export {
  GatewayClient,
  GatewayError,
  type ChatGateway,
  type GatewayClientConfig,
  type ChatRequest,
  type ChatResult,
  type ChatMessage,
  type TokenUsage
} from './gateway'

export { meterUsage, type MeterUsageArgs, type MeterUsageResult } from './metering'

export {
  MeteredGateway,
  BudgetExceededError,
  type MeteredGatewayDeps,
  type MeteredChatArgs
} from './metered-gateway'

export {
  AgentRunner,
  type AgentOptions,
  type AgentResult,
  type AgentMessage,
  type ModelStep,
  type ModelTurn,
  type ToolCall,
  type PreToolUse,
  type PreToolDecision,
  type Denial
} from './agent-runner'
