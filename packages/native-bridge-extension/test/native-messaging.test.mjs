import { describe, it, expect } from 'vitest'
import {
  encodeMessage,
  createMessageDecoder,
  MAX_MESSAGE_BYTES
} from '../host/native-messaging.mjs'

/** Collect every message a decoder emits for the given chunks. */
function drain(chunks) {
  const out = []
  const errors = []
  const decoder = createMessageDecoder((m) => out.push(m), (e) => errors.push(e))
  for (const chunk of chunks) decoder.push(chunk)
  return { out, errors }
}

describe('native-messaging framing', () => {
  it('encodes a 4-byte little-endian length prefix + UTF-8 JSON', () => {
    const frame = encodeMessage({ kind: 'health' })
    const bodyLen = frame.readUInt32LE(0)
    expect(bodyLen).toBe(frame.length - 4)
    expect(JSON.parse(frame.subarray(4).toString('utf8'))).toEqual({ kind: 'health' })
  })

  it('round-trips a single message', () => {
    const msg = { v: 1, kind: 'chat', messages: [{ role: 'user', content: 'hi' }] }
    const { out } = drain([encodeMessage(msg)])
    expect(out).toEqual([msg])
  })

  it('decodes several messages delivered in one chunk', () => {
    const a = encodeMessage({ id: 1 })
    const b = encodeMessage({ id: 2 })
    const { out } = drain([Buffer.concat([a, b])])
    expect(out).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('reassembles a message split across chunk boundaries (incl. mid-header)', () => {
    const frame = encodeMessage({ id: 'split', content: 'x'.repeat(500) })
    // Split inside the 4-byte header and again inside the body.
    const chunks = [frame.subarray(0, 2), frame.subarray(2, 40), frame.subarray(40)]
    const { out } = drain(chunks)
    expect(out).toEqual([{ id: 'split', content: 'x'.repeat(500) }])
  })

  it('handles multibyte UTF-8 without mislengthing', () => {
    const msg = { content: 'café — 日本語 — 🌉' }
    const { out } = drain([encodeMessage(msg)])
    expect(out).toEqual([msg])
  })

  it('refuses to encode a frame larger than the 1 MB cap', () => {
    const huge = { content: 'x'.repeat(MAX_MESSAGE_BYTES + 1) }
    expect(() => encodeMessage(huge)).toThrow(/too large/)
  })

  it('poisons the stream on an oversize declared length (framing desync)', () => {
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(MAX_MESSAGE_BYTES + 1, 0)
    const { out, errors } = drain([header])
    expect(out).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/exceeds/)
  })

  it('reports invalid JSON once and stops emitting', () => {
    const bad = Buffer.from('not json')
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(bad.length, 0)
    const { out, errors } = drain([Buffer.concat([header, bad])])
    expect(out).toEqual([])
    expect(errors).toHaveLength(1)
  })
})
