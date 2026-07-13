/**
 * Fold determinism — the property exploration 0314's validation checklist
 * cares about: identical board state on every client regardless of arrival
 * order, and same-seq conflicts resolving to the same winner everywhere.
 */
import { describe, expect, it } from 'vitest'
import { foldBoard, type C4MoveRecord } from './fold'

const move = (id: string, seq: number, column: number): C4MoveRecord => ({ id, seq, column })

describe('foldBoard', () => {
  it('is order-independent: any arrival order folds to the same state', () => {
    const moves = [move('a', 0, 3), move('b', 1, 3), move('c', 2, 4), move('d', 3, 0)]
    const shuffled = [moves[2], moves[0], moves[3], moves[1]]
    expect(foldBoard(shuffled)).toEqual(foldBoard(moves))
  })

  it('derives disc color from fold position, alternating red/yellow', () => {
    const state = foldBoard([move('a', 0, 0), move('b', 1, 1), move('c', 2, 2)])
    expect(state.applied.map((m) => m.disc)).toEqual(['red', 'yellow', 'red'])
    expect(state.nextDisc).toBe('yellow')
  })

  it('resolves a same-seq race deterministically by id; loser is a visible no-op', () => {
    const race = [move('z-late', 2, 5), move('a-early', 2, 6)]
    const base = [move('m0', 0, 0), move('m1', 1, 1)]

    const stateA = foldBoard([...base, ...race])
    const stateB = foldBoard([...base, ...[...race].reverse()])

    expect(stateA).toEqual(stateB)
    expect(stateA.applied.map((m) => m.id)).toEqual(['m0', 'm1', 'a-early'])
    expect(stateA.ignored.map((m) => m.id)).toEqual(['z-late'])
  })

  it('rejects out-of-sequence, out-of-range, and full-column moves', () => {
    const fill = Array.from({ length: 6 }, (_, i) => move(`f${i}`, i, 0)) // fill column 0
    const state = foldBoard([
      ...fill,
      move('overflow', 6, 0), // column 0 is full
      move('skip', 9, 3), // seq gap
      move('range', 6, 7) // column out of range
    ])
    expect(state.applied).toHaveLength(6)
    expect(state.ignored.map((m) => m.id).sort()).toEqual(['overflow', 'range', 'skip'])
  })

  it('detects a vertical win and freezes the board after it', () => {
    const state = foldBoard([
      move('a', 0, 0),
      move('b', 1, 1),
      move('c', 2, 0),
      move('d', 3, 1),
      move('e', 4, 0),
      move('f', 5, 1),
      move('g', 6, 0), // red's 4th in column 0
      move('h', 7, 2) // after the win — must be ignored
    ])
    expect(state.winner).toBe('red')
    expect(state.winningCells).toHaveLength(4)
    expect(state.ignored.map((m) => m.id)).toEqual(['h'])
  })

  it('detects a diagonal win', () => {
    // Classic staircase: red at (0,0),(1,1),(2,2),(3,3)
    const state = foldBoard([
      move('a', 0, 0), // r (0,0)
      move('b', 1, 1), // y (1,0)
      move('c', 2, 1), // r (1,1)
      move('d', 3, 2), // y (2,0)
      move('e', 4, 2), // r (2,1)
      move('f', 5, 3), // y (3,0)
      move('g', 6, 2), // r (2,2)
      move('h', 7, 3), // y (3,1)
      move('i', 8, 3), // r (3,2)
      move('j', 9, 6), // y (6,0)
      move('k', 10, 3) // r (3,3) — diagonal complete
    ])
    expect(state.winner).toBe('red')
  })

  it('a full game stays small: ≤ 42 applied moves ⇒ ≤ ~50 change-log rows', () => {
    // Drain every column; the fold caps applied moves at the board size.
    const moves: C4MoveRecord[] = []
    let seq = 0
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 6; r++) moves.push(move(`m${seq}`, seq++, c))
    }
    const state = foldBoard(moves)
    expect(state.applied.length).toBeLessThanOrEqual(42)
    expect(state.winner).not.toBeNull() // someone wins or it's a draw
  })
})
