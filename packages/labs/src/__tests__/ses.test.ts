import { describe, expect, it } from 'vitest'
import { createLabHostBridge } from '../host'
import { runSes } from '../runtime/ses'

describe('runSes', () => {
  it('returns the value and captures console output', async () => {
    const result = await runSes({
      code: 'console.log("hello", 2); return 6 * 7',
      language: 'javascript'
    })
    expect(result.ok).toBe(true)
    expect(result.value).toBe(42)
    expect(result.engine).toBe('ses')
    expect(result.logs.map((l) => l.message)).toContain('hello 2')
  })

  it('exposes JSON and Math but not ambient browser globals', async () => {
    const ok = await runSes({
      code: 'return JSON.stringify({ a: Math.max(1, 2) })',
      language: 'javascript'
    })
    expect(ok.value).toBe('{"a":2}')

    const blocked = await runSes({ code: 'return fetch("https://x")', language: 'javascript' })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/fetch/)

    const noDoc = await runSes({ code: 'return document.title', language: 'javascript' })
    expect(noDoc.ok).toBe(false)
  })

  it('times out an async hang via the wall-clock deadline', async () => {
    // In-process SES cannot interrupt a *synchronous* busy loop (the QuickJS
    // rung / terminable Worker handle that); the deadline does catch a code
    // path that never resolves.
    const result = await runSes({
      code: 'await new Promise(() => {}); return 1',
      language: 'javascript',
      timeoutMs: 100
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/timed out/i)
  })

  it('can call permission-gated host tools via the xnet global', async () => {
    const bridge = createLabHostBridge({
      store: {
        list: async () => [
          { id: 'n1', schemaId: 'xnet://xnet.fyi/Task@1.0.0', properties: { title: 'A' } },
          { id: 'n2', schemaId: 'xnet://xnet.fyi/Task@1.0.0', properties: { title: 'B' } }
        ],
        get: async () => null
      },
      permissions: { schemas: { read: ['xnet://xnet.fyi/Task@1.0.0'] } }
    })

    const result = await runSes({
      code: 'const rows = await xnet.query({ schema: "xnet://xnet.fyi/Task@1.0.0" }); return rows.length',
      language: 'javascript',
      host: bridge
    })
    expect(result.ok).toBe(true)
    expect(result.value).toBe(2)
  })

  it('surfaces a host permission denial as a run error', async () => {
    const bridge = createLabHostBridge({
      store: { list: async () => [], get: async () => null },
      permissions: { schemas: { read: ['xnet://xnet.fyi/Page@1.0.0'] } }
    })
    const result = await runSes({
      code: 'return await xnet.query({ schema: "xnet://xnet.fyi/Task@1.0.0" })',
      language: 'javascript',
      host: bridge
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not permitted/i)
  })
})
