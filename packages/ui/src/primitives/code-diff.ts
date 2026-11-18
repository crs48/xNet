import type { Chunk } from '@codemirror/merge'
import type { Text } from '@codemirror/state'

/** Count the lines highlighted by the diff, including insertions at end of file. */
export function codeDiffSummary(before: Text, after: Text, chunks: readonly Chunk[]) {
  const lines = (doc: Text, from: number, to: number) =>
    from === to || doc.length === 0
      ? 0
      : doc.lineAt(Math.min(to - 1, doc.length)).number - doc.lineAt(from).number + 1
  return {
    added: chunks.reduce((sum, chunk) => sum + lines(after, chunk.fromB, chunk.toB), 0),
    removed: chunks.reduce((sum, chunk) => sum + lines(before, chunk.fromA, chunk.toA), 0),
    precise: chunks.every((chunk) => chunk.precise)
  }
}
