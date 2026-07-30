import { describe, expect, it } from 'vitest'
import {
  foldStreamJsonFrames,
  initialStreamJsonFrameState,
  type AgentFrame,
  type StreamJsonFrameState
} from './agent-frames'

/** Fold a sequence of NDJSON lines and collect every emitted frame. */
function foldAll(lines: string[]): { frames: AgentFrame[]; state: StreamJsonFrameState } {
  let state = initialStreamJsonFrameState()
  const frames: AgentFrame[] = []
  for (const line of lines) {
    const step = foldStreamJsonFrames(state, line)
    state = step.state
    frames.push(...step.frames)
  }
  return { frames, state }
}

const j = (value: unknown): string => JSON.stringify(value)

describe('foldStreamJsonFrames', () => {
  it('emits a session frame with capabilities from system/init', () => {
    const { frames } = foldAll([
      j({ type: 'system', subtype: 'init', session_id: 'sess-1', capabilities: ['a', 'b'] })
    ])
    expect(frames).toEqual([{ type: 'session', sessionId: 'sess-1', capabilities: ['a', 'b'] }])
  })

  it('omits capabilities when absent', () => {
    const { frames } = foldAll([j({ type: 'system', subtype: 'init', session_id: 'sess-1' })])
    expect(frames).toEqual([{ type: 'session', sessionId: 'sess-1' }])
  })

  it('emits delta frames for partial text_delta events', () => {
    const { frames, state } = foldAll([
      j({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }
      }),
      j({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }
      })
    ])
    expect(frames).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' }
    ])
    expect(state.text).toBe('Hello')
    expect(state.sawPartialDelta).toBe(true)
  })

  it('emits a tool_call frame for an assistant tool_use block', () => {
    const { frames } = foldAll([
      j({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu-1', name: 'xnet_update', input: { id: 'n1' } }]
        }
      })
    ])
    expect(frames).toEqual([
      { type: 'tool_call', id: 'tu-1', name: 'xnet_update', input: { id: 'n1' } }
    ])
  })

  it('emits a tool_result frame for a user tool_result block', () => {
    const { frames } = foldAll([
      j({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'applied', is_error: false }
          ]
        }
      })
    ])
    expect(frames).toEqual([{ type: 'tool_result', id: 'tu-1', ok: true, content: 'applied' }])
  })

  it('marks a tool_result as not ok when is_error is true', () => {
    const { frames } = foldAll([
      j({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't', is_error: true }] }
      })
    ])
    expect(frames).toEqual([{ type: 'tool_result', id: 't', ok: false }])
  })

  it('emits a permission_request frame for a can_use_tool control request', () => {
    const { frames } = foldAll([
      j({
        type: 'control_request',
        request_id: 'req-9',
        request: { subtype: 'can_use_tool', tool_name: 'xnet_delete', input: { id: 'n2' } }
      })
    ])
    expect(frames).toEqual([
      { type: 'permission_request', id: 'req-9', tool: 'xnet_delete', input: { id: 'n2' } }
    ])
  })

  it('emits cost then result on a successful result event', () => {
    const { frames, state } = foldAll([
      j({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }
      }),
      j({
        type: 'result',
        subtype: 'success',
        session_id: 'sess-2',
        total_cost_usd: 0.0012,
        usage: { input_tokens: 10, output_tokens: 3 }
      })
    ])
    expect(frames).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'cost', usd: 0.0012, inputTokens: 10, outputTokens: 3 },
      { type: 'result', ok: true, text: 'hi', sessionId: 'sess-2' }
    ])
    expect(state.done).toBe(true)
  })

  it('folds a result-only reply into the terminal result frame (no partials)', () => {
    const { frames } = foldAll([
      j({ type: 'result', subtype: 'success', session_id: 's', result: 'full answer' })
    ])
    expect(frames).toEqual([{ type: 'result', ok: true, text: 'full answer', sessionId: 's' }])
  })

  it('emits an error result frame on a failed result', () => {
    const { frames, state } = foldAll([
      j({ type: 'result', subtype: 'error_max_turns', is_error: true, result: 'too many turns' })
    ])
    expect(frames).toEqual([{ type: 'result', ok: false, error: 'too many turns' }])
    expect(state.error).toBe('too many turns')
  })

  it('does not double-count complete assistant text after partial deltas', () => {
    const { frames } = foldAll([
      j({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'streamed' } }
      }),
      j({ type: 'assistant', message: { content: [{ type: 'text', text: 'streamed' }] } })
    ])
    expect(frames).toEqual([{ type: 'delta', text: 'streamed' }])
  })

  it('emits assistant text as a delta when no partials streamed (older CLI)', () => {
    const { frames } = foldAll([
      j({ type: 'assistant', message: { content: [{ type: 'text', text: 'whole reply' }] } })
    ])
    expect(frames).toEqual([{ type: 'delta', text: 'whole reply' }])
  })

  it('ignores non-JSON noise on stdout', () => {
    const { frames } = foldAll(['not json', '', '{bad'])
    expect(frames).toEqual([])
  })

  it('omits the cost frame when neither cost nor usage is present', () => {
    const { frames } = foldAll([j({ type: 'result', subtype: 'success', result: 'x' })])
    expect(frames.some((f) => f.type === 'cost')).toBe(false)
  })
})
