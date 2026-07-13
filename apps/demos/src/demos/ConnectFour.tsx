/**
 * Connect Four — the signed-move-log demo (exploration 0314, Tier 1).
 *
 * Moves ride the persisted change log ON PURPOSE: each is a small signed,
 * hash-chained entry (~40 per game), so the game history is cheat-evident.
 * The board is never stored — every client folds the same move list to the
 * same state (see lib/fold.ts). Hover indicators ride Awareness.
 */
import { useMutate, useNode, usePresence, useQuery } from '@xnetjs/react'
import { useMemo, useState } from 'react'
import { COLS, ROWS, foldBoard } from '../lib/fold'
import { shortDid } from '../lib/identity'
import { peerColor, peerName } from '../lib/peer-style'
import { roomNodeId } from '../lib/room'
import { C4Move, DemoRoom } from '../lib/schemas'

interface HoverState extends Record<string, unknown> {
  hoverCol: number
  name: string
  color: string
}

export function ConnectFour({ room, did }: { room: string; did: string }) {
  const { awareness, syncStatus, peerCount } = useNode(DemoRoom, roomNodeId('connect-four', room), {
    createIfMissing: { title: `connect four — ${room}` },
    did
  })
  const { peers, setState } = usePresence<HoverState>(awareness, {
    hoverCol: -1,
    name: peerName(did),
    color: peerColor(did)
  })

  const moves = useQuery(C4Move, { where: { room }, limit: 100 })
  const { create, isPending } = useMutate()
  const [showLog, setShowLog] = useState(false)

  const board = useMemo(
    () =>
      foldBoard(
        (moves.data ?? []).map((node) => ({
          id: node.id,
          // A malformed move (missing fields) folds as an illegal no-op.
          seq: node.seq ?? -1,
          column: node.column ?? -1
        }))
      ),
    [moves.data]
  )

  const authorOf = useMemo(() => {
    const byId = new Map<string, string>()
    for (const node of moves.data ?? []) byId.set(node.id, node.createdBy)
    return (id: string) => byId.get(id) ?? '?'
  }, [moves.data])

  const drop = (column: number) => {
    if (board.winner || isPending) return
    // Claim the next fold position; a simultaneous claim by someone else
    // resolves deterministically at fold time (loser becomes a visible no-op).
    void create(C4Move, { room, seq: board.nextSeq, column })
  }

  const peerHoverCols = new Set(
    peers.map((p) => p.state.hoverCol).filter((c) => typeof c === 'number' && c >= 0)
  )

  return (
    <>
      <div className="shell-header">
        <span className="chip">
          <span className={`dot ${syncStatus === 'connected' ? 'on' : ''}`} />
          {syncStatus}
        </span>
        <span className="chip">{peerCount + 1} here</span>
        <span className="chip">
          {board.winner === 'draw' ? (
            'draw!'
          ) : board.winner ? (
            <>
              <span className={`turn-disc ${board.winner}`} /> wins!
            </>
          ) : (
            <>
              next: <span className={`turn-disc ${board.nextDisc}`} /> (move {board.nextSeq + 1})
            </>
          )}
        </span>
        <span className="spacer" />
        <button onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Hide' : 'Show'} signed move log
        </button>
      </div>

      <div className="c4-wrap">
        <div className="c4-board" role="grid" aria-label="Connect Four board">
          {Array.from({ length: COLS }, (_, col) => (
            <div
              key={col}
              className={`c4-col ${peerHoverCols.has(col) ? 'peer-hover' : ''}`}
              onClick={() => drop(col)}
              onPointerEnter={() => setState({ hoverCol: col })}
              onPointerLeave={() => setState({ hoverCol: -1 })}
              role="button"
              aria-label={`drop in column ${col + 1}`}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const disc = board.grid[col][row]
                const isWin = board.winningCells.some(([c, r]) => c === col && r === row)
                return <div key={row} className={`c4-cell ${disc ?? ''} ${isWin ? 'win' : ''}`} />
              })}
            </div>
          ))}
        </div>

        <div className="c4-side">
          <div className="card">
            <h2>Anyone can drop the next disc</h2>
            <p>
              Turns alternate by move number, not by player — grab a friend and take turns, or play
              both sides. Disc color is derived from the move's position in the fold, so nobody can
              play out of turn.
            </p>
            <div className="lane">
              Every move is a signed, hash-chained change-log entry authored by a real DID. A full
              game is ~40 entries — the one game workload where the persisted log is a feature.
            </div>
          </div>
          {showLog && (
            <div className="card">
              <h2>Move log</h2>
              <ol className="movelog">
                {board.applied.map((m) => (
                  <li key={m.id}>
                    #{m.seq + 1} {m.disc} → col {m.column + 1} · signed by{' '}
                    {shortDid(authorOf(m.id))}
                  </li>
                ))}
              </ol>
              {board.ignored.length > 0 && (
                <p>
                  {board.ignored.length} conflicting/illegal move
                  {board.ignored.length === 1 ? '' : 's'} folded as no-ops (visible, not
                  destructive).
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
