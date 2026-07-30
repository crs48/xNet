/**
 * Connect Four as a deterministic fold over an append-only move log.
 *
 * The board is never stored — every client independently folds the same
 * sorted move list to the same state (exploration 0314). Simultaneous claims
 * of the same seq are resolved by a total order every client shares (seq,
 * then node id); the loser's move folds as a no-op and shows up in
 * `ignored`, making the conflict visible instead of corrupting the board.
 *
 * Disc color is DERIVED from fold position (even = red, odd = yellow), never
 * trusted from the payload — a client claiming an out-of-turn color simply
 * has no way to express it.
 */

export const COLS = 7
export const ROWS = 6

export type Disc = 'red' | 'yellow'

export interface C4MoveRecord {
  /** Node id — globally unique, identical on every client (tiebreak key). */
  id: string
  /** Turn number the author claimed (0-based). */
  seq: number
  /** Column dropped into (0..6). */
  column: number
}

export interface AppliedMove extends C4MoveRecord {
  disc: Disc
  row: number
}

export interface BoardState {
  /** grid[column][row], row 0 = bottom. */
  grid: Array<Array<Disc | null>>
  applied: AppliedMove[]
  /** Moves that lost a seq race or were illegal — visible, not destructive. */
  ignored: C4MoveRecord[]
  /** The seq the next legal move must claim. */
  nextSeq: number
  nextDisc: Disc
  winner: Disc | 'draw' | null
  winningCells: Array<[number, number]>
}

/** Total order shared by every client: seq, then node id. */
export function compareMoves(a: C4MoveRecord, b: C4MoveRecord): number {
  if (a.seq !== b.seq) return a.seq - b.seq
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const DIRECTIONS: Array<[number, number]> = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal /
  [1, -1] // diagonal \
]

function findWin(
  grid: Array<Array<Disc | null>>,
  col: number,
  row: number
): Array<[number, number]> {
  const disc = grid[col][row]
  if (!disc) return []
  for (const [dc, dr] of DIRECTIONS) {
    const line: Array<[number, number]> = [[col, row]]
    for (const sign of [1, -1]) {
      let c = col + dc * sign
      let r = row + dr * sign
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && grid[c][r] === disc) {
        line.push([c, r])
        c += dc * sign
        r += dr * sign
      }
    }
    if (line.length >= 4) return line
  }
  return []
}

export function foldBoard(moves: C4MoveRecord[]): BoardState {
  const grid: Array<Array<Disc | null>> = Array.from({ length: COLS }, () => Array(ROWS).fill(null))
  const applied: AppliedMove[] = []
  const ignored: C4MoveRecord[] = []
  let winner: BoardState['winner'] = null
  let winningCells: Array<[number, number]> = []

  for (const move of [...moves].sort(compareMoves)) {
    const legal =
      winner === null &&
      move.seq === applied.length &&
      Number.isInteger(move.column) &&
      move.column >= 0 &&
      move.column < COLS &&
      grid[move.column].includes(null)

    if (!legal) {
      ignored.push(move)
      continue
    }

    const disc: Disc = applied.length % 2 === 0 ? 'red' : 'yellow'
    const row = grid[move.column].indexOf(null)
    grid[move.column][row] = disc
    applied.push({ ...move, disc, row })

    const win = findWin(grid, move.column, row)
    if (win.length > 0) {
      winner = disc
      winningCells = win
    } else if (applied.length === COLS * ROWS) {
      winner = 'draw'
    }
  }

  return {
    grid,
    applied,
    ignored,
    nextSeq: applied.length,
    nextDisc: applied.length % 2 === 0 ? 'red' : 'yellow',
    winner,
    winningCells
  }
}
