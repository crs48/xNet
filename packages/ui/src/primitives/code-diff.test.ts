import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { codeDiffSummary } from './code-diff'

const compare = (before: string, after: string) => {
  const a = Text.of(before.split('\n'))
  const b = Text.of(after.split('\n'))
  return codeDiffSummary(a, b, Chunk.build(a, b))
}

describe('code diff line counts', () => {
  it('excludes unchanged lines between separate edits', () => {
    const context = Array.from({ length: 15 }, (_, i) => `const value${i} = ${i}`).join('\n')
    expect(
      compare(`old heading\n${context}\nold footer`, `new heading\n${context}\nnew footer`)
    ).toEqual({ added: 2, removed: 2, precise: true })
  })
  it('counts additions, deletions, and edits at end of file', () => {
    expect(compare('first\nlast', 'first\nextra\nlast')).toMatchObject({ added: 1, removed: 0 })
    expect(compare('first\nextra\nlast', 'first\nlast')).toMatchObject({ added: 0, removed: 1 })
    expect(compare('first\nlast', 'first\nchanged')).toMatchObject({ added: 1, removed: 1 })
  })
  it('does not invent a removed line for an empty file or identical source', () => {
    expect(compare('', 'one\ntwo')).toMatchObject({ added: 2, removed: 0 })
    expect(compare('one\ntwo', '')).toMatchObject({ added: 0, removed: 2 })
    expect(compare('same\n', 'same\n')).toMatchObject({ added: 0, removed: 0 })
    expect(compare('', '')).toMatchObject({ added: 0, removed: 0 })
  })
  it('handles a trailing newline and Unicode source', () => {
    expect(compare('const title = "🌿"', 'const title = "🌳"\n')).toMatchObject({
      added: 2,
      removed: 1
    })
  })
})
