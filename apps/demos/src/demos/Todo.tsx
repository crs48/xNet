/**
 * Collab todo — the "hackathon speed" demo (exploration 0314, Tier 3).
 * The list is ordinary structured data (useQuery/useMutate, optimistic
 * local-first writes); live cursors ride Awareness on the room node.
 * The core list logic is ~40 lines — mirrored by examples/minimal-app.
 */
import { useMutate, useNode, usePresence, useQuery } from '@xnetjs/react'
import { useCallback, useRef, useState } from 'react'
import { peerColor, peerName } from '../lib/peer-style'
import { roomNodeId } from '../lib/room'
import { DemoRoom, DemoTodo } from '../lib/schemas'

interface CursorState extends Record<string, unknown> {
  cx: number
  cy: number
  name: string
  color: string
}

export function Todo({ room, did }: { room: string; did: string }) {
  const { awareness, syncStatus, peerCount } = useNode(DemoRoom, roomNodeId('todo', room), {
    createIfMissing: { title: `todo — ${room}` },
    did
  })
  const { peers, setState } = usePresence<CursorState>(awareness, {
    cx: -1,
    cy: -1,
    name: peerName(did),
    color: peerColor(did)
  })

  const todos = useQuery(DemoTodo, { where: { room }, orderBy: { createdAt: 'asc' } })
  const { create, update, remove } = useMutate()
  const [draft, setDraft] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      setState({
        cx: (e.clientX - rect.left) / rect.width,
        cy: (e.clientY - rect.top) / rect.height
      })
    },
    [setState]
  )

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    setDraft('')
    void create(DemoTodo, { room, title, done: false })
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onPointerMove={onPointerMove}>
      <div className="shell-header" style={{ marginBottom: 12 }}>
        <span className="chip">
          <span className={`dot ${syncStatus === 'connected' ? 'on' : ''}`} />
          {syncStatus}
        </span>
        <span className="chip">{peerCount + 1} here</span>
      </div>

      <form className="todo-form" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a todo — it appears on every screen in the room"
          aria-label="New todo"
        />
        <button className="primary" type="submit">
          Add
        </button>
      </form>

      <ul className="todo-list" style={{ marginTop: 12 }}>
        {(todos.data ?? []).map((todo) => (
          <li key={todo.id} className={todo.done ? 'done' : ''}>
            <input
              type="checkbox"
              checked={!!todo.done}
              onChange={() => void update(DemoTodo, todo.id, { done: !todo.done })}
              aria-label={`toggle ${todo.title}`}
            />
            <span className="title">{todo.title}</span>
            <button onClick={() => void remove(todo.id)} aria-label={`delete ${todo.title}`}>
              ×
            </button>
          </li>
        ))}
      </ul>

      {peers.map(({ clientId, state }) =>
        state.cx >= 0 ? (
          <div
            key={clientId}
            className="cursor"
            style={{ left: `${state.cx * 100}%`, top: `${state.cy * 100}%` }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M0 0 L16 6 L9 9 L6 16 Z" fill={state.color} />
            </svg>
            <span className="label" style={{ background: state.color }}>
              {state.name}
            </span>
          </div>
        ) : null
      )}

      <p className="footer-note">
        Writes hit the local store synchronously and sync in the background — try adding a todo with
        the network tab throttled. Cursors are ephemeral Awareness state.
      </p>
    </div>
  )
}
