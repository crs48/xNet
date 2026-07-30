/**
 * The framed bridge client (0392→0394): defensive frame parse, SSE splitting
 * with [DONE] termination, and the provider contract — deltas stream to the
 * runtime, structured frames reach the panel, an error result throws.
 */

import { describe, expect, it } from 'vitest'
import {
  createFramedBridgeProvider,
  parseBridgeFrame,
  sseDataPayloads,
  type BridgeAgentFrame
} from './ai-bridge-frames'

function sseBody(payloads: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const payload of payloads) controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      controller.close()
    }
  })
}

describe('parseBridgeFrame', () => {
  it('parses each frame type and rejects malformed payloads', () => {
    expect(parseBridgeFrame('{"type":"delta","text":"hi"}')).toEqual({ type: 'delta', text: 'hi' })
    expect(parseBridgeFrame('{"type":"tool_call","id":"t1","name":"Read"}')).toEqual({
      type: 'tool_call',
      id: 't1',
      name: 'Read',
      input: undefined
    })
    expect(parseBridgeFrame('{"type":"permission_request","id":"p1","tool":"Bash"}')).toEqual({
      type: 'permission_request',
      id: 'p1',
      tool: 'Bash',
      input: undefined
    })
    expect(parseBridgeFrame('{"type":"cost","usd":0.03}')).toEqual({ type: 'cost', usd: 0.03 })
    expect(parseBridgeFrame('not json')).toBeNull()
    expect(parseBridgeFrame('{"type":"delta"}')).toBeNull() // missing text
    expect(parseBridgeFrame('{"type":"unknown"}')).toBeNull()
  })
})

describe('sseDataPayloads', () => {
  it('splits data lines and stops at [DONE]', async () => {
    const body = sseBody(['{"a":1}', '{"b":2}', '[DONE]', '{"never":true}'])
    const seen: string[] = []
    for await (const payload of sseDataPayloads(body)) seen.push(payload)
    expect(seen).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('reassembles frames split across chunks', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"ty'))
        controller.enqueue(encoder.encode('pe":"delta","text":"x"}\n'))
        controller.enqueue(encoder.encode('\ndata: [DONE]\n\n'))
        controller.close()
      }
    })
    const seen: string[] = []
    for await (const payload of sseDataPayloads(body)) seen.push(payload)
    expect(seen).toEqual(['{"type":"delta","text":"x"}'])
  })
})

describe('createFramedBridgeProvider', () => {
  const respond = (payloads: string[], ok = true) =>
    (async () =>
      ({
        ok,
        status: ok ? 200 : 500,
        body: sseBody(payloads)
      }) as unknown as Response) as unknown as typeof fetch

  it('streams deltas to the runtime and forwards structured frames', async () => {
    const frames: BridgeAgentFrame[] = []
    const provider = createFramedBridgeProvider({
      baseUrl: 'http://127.0.0.1:31416',
      token: 'tok',
      onFrame: (frame) => frames.push(frame),
      fetchImpl: respond([
        '{"type":"session","sessionId":"s1"}',
        '{"type":"tool_call","id":"t1","name":"Read"}',
        '{"type":"tool_result","id":"t1","ok":true}',
        '{"type":"delta","text":"hello "}',
        '{"type":"delta","text":"world"}',
        '{"type":"cost","usd":0.01}',
        '{"type":"result","ok":true,"text":"hello world","sessionId":"s1"}'
      ])
    })
    let text = ''
    for await (const chunk of provider.stream!({ messages: [{ role: 'user', content: 'hi' }] })) {
      if (chunk.type === 'text') text += chunk.text
    }
    expect(text).toBe('hello world')
    expect(frames.map((f) => f.type)).toEqual([
      'session',
      'tool_call',
      'tool_result',
      'delta',
      'delta',
      'cost',
      'result'
    ])
  })

  it('throws on a terminal error result so a failed turn is a failed run', async () => {
    const provider = createFramedBridgeProvider({
      baseUrl: 'http://x',
      token: 'tok',
      fetchImpl: respond(['{"type":"result","ok":false,"error":"agent exploded"}'])
    })
    await expect(provider.generate('hi')).rejects.toThrow('agent exploded')
  })

  it('throws on a non-200 response instead of an empty reply', async () => {
    const provider = createFramedBridgeProvider({
      baseUrl: 'http://x',
      token: 'bad',
      fetchImpl: respond([], false)
    })
    await expect(provider.generate('hi')).rejects.toThrow('HTTP 500')
  })
})
