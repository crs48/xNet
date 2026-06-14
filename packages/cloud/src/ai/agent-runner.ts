/**
 * @xnetjs/cloud/ai — sandboxed agent-safety harness.
 *
 * The provider-agnostic core of a server-side agent (exploration 0175). It runs a
 * tool-use loop and enforces the safety controls that matter when an agent reads a
 * tenant's own data:
 *   - an `allowedTools` allow-list (tools outside it are never executed),
 *   - a `preToolUse` hook (the prompt-injection deny point), and
 *   - a per-session **token-cap circuit breaker**.
 *
 * The model is injected as a `ModelStep`, so the whole harness is deterministically
 * testable with scripted turns — no Anthropic key, no msw, no network. A thin Claude
 * Agent SDK adapter (mapping its hooks onto this) is the only remaining wiring.
 */

import type { TokenUsage } from './gateway'

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export type ModelTurn =
  | { kind: 'tool_use'; toolCalls: ToolCall[]; usage: TokenUsage }
  | { kind: 'final'; text: string; usage: TokenUsage }

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
}

/** Produces the next model turn given the running transcript. Injected for testing. */
export type ModelStep = (history: AgentMessage[]) => Promise<ModelTurn>

export type PreToolDecision = { allow: true } | { allow: false; reason: string }
export type PreToolUse = (call: ToolCall) => PreToolDecision | Promise<PreToolDecision>

export interface AgentOptions {
  /** Tools the agent may call; anything else is denied before execution. */
  allowedTools: string[]
  /** Per-call guard (tenant-scope checks, prompt-injection blocks). */
  preToolUse?: PreToolUse
  /** Execute an approved tool call; returns the tool result. */
  executeTool: (call: ToolCall) => Promise<unknown>
  /** Abort the session once cumulative tokens exceed this cap. */
  maxTotalTokens?: number
  /** Safety bound on loop iterations. Default 16. */
  maxSteps?: number
}

export interface Denial {
  tool: string
  reason: string
}

export interface AgentResult {
  text: string
  denials: Denial[]
  tokensUsed: number
  steps: number
  stoppedBy: 'final' | 'token-cap' | 'max-steps'
}

const result = (text: string): string => JSON.stringify({ result: text })

export class AgentRunner {
  async run(prompt: string, step: ModelStep, opts: AgentOptions): Promise<AgentResult> {
    const allowed = new Set(opts.allowedTools)
    const maxSteps = opts.maxSteps ?? 16
    const history: AgentMessage[] = [{ role: 'user', content: prompt }]
    const denials: Denial[] = []
    let tokensUsed = 0

    for (let steps = 1; steps <= maxSteps; steps++) {
      const turn = await step(history)
      tokensUsed += turn.usage.totalTokens

      if (opts.maxTotalTokens !== undefined && tokensUsed > opts.maxTotalTokens) {
        return { text: '', denials, tokensUsed, steps, stoppedBy: 'token-cap' }
      }

      if (turn.kind === 'final') {
        return { text: turn.text, denials, tokensUsed, steps, stoppedBy: 'final' }
      }

      for (const call of turn.toolCalls) {
        if (!allowed.has(call.name)) {
          const reason = `tool '${call.name}' not in allowedTools`
          denials.push({ tool: call.name, reason })
          history.push({ role: 'tool', content: result(`denied: ${reason}`) })
          continue
        }
        const decision = await opts.preToolUse?.(call)
        if (decision && decision.allow === false) {
          denials.push({ tool: call.name, reason: decision.reason })
          history.push({ role: 'tool', content: result(`denied: ${decision.reason}`) })
          continue
        }
        const out = await opts.executeTool(call)
        history.push({ role: 'tool', content: result(JSON.stringify(out ?? null)) })
      }
    }

    return { text: '', denials, tokensUsed, steps: maxSteps, stoppedBy: 'max-steps' }
  }
}
