/**
 * Unified drag payload tests (0166).
 */
import { describe, expect, it } from 'vitest'
import { getNodeTransfer, hasNodeTransfer, setNodeTransfer, XNET_NODE_MIME } from './node-transfer'

function makeEvent(data: Record<string, string> = {}): DragEvent {
  const store = new Map(Object.entries(data))
  return {
    dataTransfer: {
      types: [...store.keys()],
      getData: (type: string) => store.get(type) ?? '',
      setData: (type: string, value: string) => {
        store.set(type, value)
      }
    }
  } as unknown as DragEvent
}

describe('node transfer', () => {
  it('round-trips a transfer with a plain-text fallback', () => {
    const event = makeEvent()
    setNodeTransfer(event, { nodeId: 'n1', nodeType: 'page', title: 'T', sourceContext: 'tab' })

    expect(event.dataTransfer?.getData('text/plain')).toBe('xnet://page/n1')
    expect(getNodeTransfer(event)).toEqual({
      nodeId: 'n1',
      nodeType: 'page',
      title: 'T',
      sourceContext: 'tab'
    })
  })

  it('returns null for missing or malformed payloads', () => {
    expect(getNodeTransfer(makeEvent())).toBeNull()
    expect(getNodeTransfer(makeEvent({ [XNET_NODE_MIME]: 'not json' }))).toBeNull()
    expect(getNodeTransfer(makeEvent({ [XNET_NODE_MIME]: '{"nodeId":1}' }))).toBeNull()
  })

  it('detects the MIME during dragover without reading the payload', () => {
    expect(hasNodeTransfer(makeEvent({ [XNET_NODE_MIME]: '{}' }))).toBe(true)
    expect(hasNodeTransfer(makeEvent({ 'text/plain': 'x' }))).toBe(false)
    expect(hasNodeTransfer({} as DragEvent)).toBe(false)
  })
})
