import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

describe('RelativePosition cross-doc resolution', () => {
  it('should resolve positions on Y.XmlText nodes across docs', () => {
    // Create doc and populate (like the seed does)
    const doc1 = new Y.Doc({ gc: false })
    const frag1 = doc1.getXmlFragment('content')

    doc1.transact(() => {
      const p = new Y.XmlElement('paragraph')
      const textNode = new Y.XmlText('Hello world this is a test')
      p.insert(0, [textNode])
      frag1.push([p])
    })

    // Find the text node and create positions on it (the fixed approach)
    const textNode = (frag1.get(0) as Y.XmlElement).get(0) as Y.XmlText
    expect(textNode.toString()).toBe('Hello world this is a test')

    // Create relative position for "world" (offset 6-11 in the text node)
    const startRelPos = Y.createRelativePositionFromTypeIndex(textNode, 6)
    const endRelPos = Y.createRelativePositionFromTypeIndex(textNode, 11)

    // Encode as update
    const update = Y.encodeStateAsUpdate(doc1)

    // Load into a new doc (like the editor does)
    const doc2 = new Y.Doc({ gc: false })
    Y.applyUpdate(doc2, update)

    // Resolve in doc2
    const startAbs = Y.createAbsolutePositionFromRelativePosition(startRelPos, doc2)
    const endAbs = Y.createAbsolutePositionFromRelativePosition(endRelPos, doc2)

    expect(startAbs).not.toBeNull()
    expect(endAbs).not.toBeNull()
    expect(startAbs!.index).toBe(6)
    expect(endAbs!.index).toBe(11)

    // The resolved type should be the XmlText node in doc2
    expect(startAbs!.type).toBeInstanceOf(Y.XmlText)

    // Also test encode/decode round-trip (as the seed does via base64)
    const startEncoded = Y.encodeRelativePosition(startRelPos)
    const endEncoded = Y.encodeRelativePosition(endRelPos)
    const startDecoded = Y.decodeRelativePosition(startEncoded)
    const endDecoded = Y.decodeRelativePosition(endEncoded)

    const startAbs2 = Y.createAbsolutePositionFromRelativePosition(startDecoded, doc2)
    const endAbs2 = Y.createAbsolutePositionFromRelativePosition(endDecoded, doc2)

    expect(startAbs2).not.toBeNull()
    expect(endAbs2).not.toBeNull()
    expect(startAbs2!.index).toBe(6)
    expect(endAbs2!.index).toBe(11)
  })

  it('OLD approach fails: positions on fragment resolve incorrectly', () => {
    const doc1 = new Y.Doc({ gc: false })
    const frag1 = doc1.getXmlFragment('content')

    doc1.transact(() => {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText('Hello world this is a test')])
      frag1.push([p])
    })

    // OLD broken approach: create position on the fragment itself
    const startRelPos = Y.createRelativePositionFromTypeIndex(frag1, 6)

    const update = Y.encodeStateAsUpdate(doc1)
    const doc2 = new Y.Doc({ gc: false })
    Y.applyUpdate(doc2, update)

    const startAbs = Y.createAbsolutePositionFromRelativePosition(startRelPos, doc2)

    // This resolves to index 1 (clamped), not 6 — because frag only has 1 child
    expect(startAbs).not.toBeNull()
    expect(startAbs!.index).toBe(1) // Wrong! Should be 6 for "world"
  })
})
