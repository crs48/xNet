import { describe, expect, it } from 'vitest'
import { parseSseJson } from './sse'

/** A ReadableStream of UTF-8 bytes from `chunks` (to exercise cross-chunk buffering). */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    }
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const ev of parseSseJson(stream)) out.push(ev)
  return out
}

describe('parseSseJson', () => {
  it('parses data: JSON lines and stops at [DONE]', async () => {
    const body = streamOf([
      'data: {"a":1}\n\n',
      'data: {"b":2}\n\n',
      'data: [DONE]\n\n',
      'data: {"c":3}\n\n' // after DONE — ignored
    ])
    expect(await collect(body)).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('handles a data line split across stream chunks', async () => {
    const body = streamOf(['data: {"hel', 'lo":"wor', 'ld"}\n\n', 'data: [DONE]\n\n'])
    expect(await collect(body)).toEqual([{ hello: 'world' }])
  })

  it('skips SSE comments and blank keepalives', async () => {
    const body = streamOf([': keepalive\n\n', 'data: {"x":1}\n\n', '\n', 'data: [DONE]\n'])
    expect(await collect(body)).toEqual([{ x: 1 }])
  })

  it('tolerates a malformed data line', async () => {
    const body = streamOf(['data: not-json\n\n', 'data: {"ok":true}\n\n'])
    expect(await collect(body)).toEqual([{ ok: true }])
  })
})
