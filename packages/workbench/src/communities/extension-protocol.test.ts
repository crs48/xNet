// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  assertExtensionMessage,
  decodeExtensionFailure,
  encodeExtensionFailure,
  extensionUndoMessage,
  ExtensionAccessError,
  EXTENSION_ERROR_CODES
} from './extension-protocol'

describe('extension protocol boundary', () => {
  it('explains a rejected undo without leaking IPC details or promising rollback for unknown failures', () => {
    expect(
      extensionUndoMessage(
        new Error(
          "Error invoking remote method 'xnet:nodes:applyNodeBatch': Error: Conditional transaction conflict: a record changed before commit."
        )
      )
    ).toBe('Cannot undo: a task changed after this edit. This undo changed no tasks.')
    expect(
      extensionUndoMessage(new ExtensionAccessError('revoked', 'Access was revoked.'))
    ).toContain('Access was revoked.')
    const unknown = extensionUndoMessage(new Error('/private/path connection lost after commit'))
    expect(unknown).toContain('Refresh the preview before retrying.')
    expect(unknown).not.toMatch(/private|changed no tasks|rolled back|connection lost/)
  })
  it('round-trips tagged failures without leaking host causes, paths or stacks', () => {
    for (const code of EXTENSION_ERROR_CODES) {
      const error = new ExtensionAccessError(code, `Public ${code}`)
      const wire = encodeExtensionFailure(error)
      expect(Object.keys(wire).sort()).toEqual(['_tag', 'code', 'message', 'version'])
      expect(decodeExtensionFailure(structuredClone(wire))).toMatchObject({
        _tag: 'ExtensionAccessError',
        code,
        message: `Public ${code}`
      })
    }
    const internal = new Error('/Users/owner/private.key token=secret', {
      cause: new Error('secret')
    })
    const wire = encodeExtensionFailure(internal)
    expect(wire.code).toBe('unavailable')
    expect(JSON.stringify(wire)).not.toMatch(/secret|private.key|\/Users/)
    expect(() => decodeExtensionFailure({ ...wire, code: 'host.admin' })).toThrow('Invalid failure')
    expect(() => decodeExtensionFailure({ ...wire, stack: 'secret' })).toThrow('Unsupported')
  })
  it('accepts the full supported view depth before the separate render-tree validator', () => {
    let tree: unknown = { type: 'text', text: 'Nested text' }
    for (let depth = 0; depth < 12; depth++) tree = { type: 'stack', children: [tree] }
    expect(() => assertExtensionMessage({ type: 'view', revision: 1, tree })).not.toThrow()
  })
  it('bounds recursive and non-JSON structured-clone input before serialization', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    let deep: unknown = 'payload'
    for (let i = 0; i < 10_000; i++) deep = { child: deep }
    for (const input of [
      cycle,
      deep,
      { value: 1n },
      new Uint8Array(100_000),
      Array(4097).fill(0),
      { text: '界'.repeat(23_000) },
      { text: 'x'.repeat(66_001) }
    ])
      expect(() => assertExtensionMessage(input)).toThrow(ExtensionAccessError)
    const getter = vi.fn(() => 'private')
    expect(() =>
      assertExtensionMessage(Object.defineProperty({}, 'x', { enumerable: true, get: getter }))
    ).toThrow('accessors')
    expect(getter).not.toHaveBeenCalled()
    expect(() =>
      assertExtensionMessage({ type: 'view', tree: { type: 'text', text: 'OK', children: [] } })
    ).not.toThrow()
  })
})
