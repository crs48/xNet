// A complete synced multiplayer app — schema, identity, live queries,
// optimistic writes, and ephemeral cursors. This one file is the app.
import { checkbox, defineSchema, text } from '@xnetjs/data'
import { presets } from '@xnetjs/data/auth'
import { generateIdentity } from '@xnetjs/identity'
import { XNetProvider, useMutate, useNode, usePresence, useQuery } from '@xnetjs/react'
import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

// ─── Schemas ── typed data + one-line authorization ─────────────────────────
const Todo = defineSchema({
  name: 'Todo',
  namespace: 'xnet://minimal-app/',
  properties: { title: text({ required: true }), done: checkbox({}) },
  authorization: presets.open() // anyone in the room can read/write
})

const Board = defineSchema({
  name: 'Board',
  namespace: 'xnet://minimal-app/',
  properties: { title: text({}) },
  document: 'yjs', // a live doc — its Awareness channel carries the cursors
  authorization: presets.open()
})

// ─── Identity + room ── no accounts; the URL is the invitation ───────────────
const { identity, privateKey } = generateIdentity() // instant DID — no signup
const room = new URLSearchParams(location.search).get('room') ?? 'lobby'

// ─── Live cursors ── ephemeral presence, never written to storage ────────────
function Cursors() {
  // The Board node carries a live Y.Doc; useNode hands us its Awareness —
  // the ephemeral channel peers in this room use to see each other.
  const { awareness } = useNode(Board, `board-${room}`, { createIfMissing: { title: room } })

  // usePresence turns that channel into plain React state:
  //   peers    — everyone else's latest broadcast (self excluded)
  //   setState — publish ours, throttled to ~30fps so a fast pointer
  //              coalesces into a few frames instead of flooding the hub
  const { peers, setState } = usePresence(awareness, { x: -1, y: -1 })

  // The SEND side: one pointermove listener broadcasts our position as a
  // fraction of the viewport (0..1), so cursors land in the same relative
  // spot on any screen size. The effect cleans its listener up on unmount.
  useEffect(() => {
    const move = (e: PointerEvent) =>
      setState({ x: e.clientX / innerWidth, y: e.clientY / innerHeight })
    addEventListener('pointermove', move)
    return () => removeEventListener('pointermove', move)
  }, [setState])

  // The RECEIVE side: one element per remote peer, keyed by their awareness
  // clientId (one per tab). x < 0 means "hasn't moved yet" — skip it. When a
  // peer disconnects they simply drop out of `peers`; nothing to clean up.
  return (
    <>
      {peers.map(({ clientId, state }) =>
        state.x >= 0 ? (
          <span
            key={clientId}
            style={{ position: 'fixed', left: `${state.x * 100}%`, top: `${state.y * 100}%` }}
          >
            👆
          </span>
        ) : null
      )}
    </>
  )
}

// ─── The app ── useQuery is a live subscription; writes are optimistic ──────
function App() {
  const todos = useQuery(Todo, { orderBy: { createdAt: 'asc' } })
  const { create, update, remove } = useMutate()
  const [draft, setDraft] = useState('')

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>
        todos <small style={{ fontWeight: 'normal' }}>room: {room}</small>
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) void create(Todo, { title: draft.trim(), done: false })
          setDraft('')
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a todo" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {(todos.data ?? []).map((todo) => (
          <li key={todo.id}>
            <label style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
              <input
                type="checkbox"
                checked={!!todo.done}
                onChange={() => void update(Todo, todo.id, { done: !todo.done })}
              />
              {todo.title}
            </label>
            <button onClick={() => void remove(todo.id)}>×</button>
          </li>
        ))}
      </ul>
      <Cursors />
    </main>
  )
}

// ─── Boot ── one provider: local-first store + signed sync through a hub ────
ReactDOM.createRoot(document.getElementById('root')!).render(
  <XNetProvider
    config={{
      authorDID: identity.did,
      signingKey: privateKey,
      identity,
      hubUrl: 'wss://hub.xnet.fyi', // public demo hub — or ws://localhost:4444 (npm run hub)
      hubOptions: { nodeSyncRoom: `xnet-minimal-${room}` }
    }}
  >
    <App />
  </XNetProvider>
)
