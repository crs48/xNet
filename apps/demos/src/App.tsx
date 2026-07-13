/**
 * xNet demos shell — hash-routed views (`#/<demo>/<room>`), one XNetProvider
 * per room so the node-change relay room follows the URL. The URL is the
 * invitation: share it and the other person is in your room.
 */
import { XNetDevToolsProvider } from '@xnetjs/devtools'
import { XNetProvider } from '@xnetjs/react'
import { useEffect, useMemo, useState } from 'react'
import { ConnectFour } from './demos/ConnectFour'
import { CursorParty } from './demos/CursorParty'
import { Todo } from './demos/Todo'
import { HUB_URL, nodeSyncRoom } from './lib/config'
import { loadOrCreateIdentity, shortDid } from './lib/identity'
import { parseRoute, randomRoomCode, routeHash, type DemoRoute, type DemoView } from './lib/room'

const { identity, privateKey } = loadOrCreateIdentity()

function useRoute(): DemoRoute {
  const [route, setRoute] = useState<DemoRoute>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  // Normalize the URL so a bare `#/todo` becomes a shareable `#/todo/<room>`.
  useEffect(() => {
    const canonical = routeHash(route.view, route.room)
    if (route.view !== 'home' && window.location.hash !== canonical) {
      window.history.replaceState({}, '', canonical)
    }
  }, [route])
  return route
}

const DEMOS: Array<{ view: DemoView; title: string; blurb: string; lane: string }> = [
  {
    view: 'cursors',
    title: 'Cursor party',
    blurb: 'Live cursors and emoji bursts. Open it twice and wave at yourself.',
    lane: 'Lane: Awareness only — ephemeral, nothing is ever persisted.'
  },
  {
    view: 'connect-four',
    title: 'Connect Four',
    blurb: 'Shared board, take turns. Every move is a signed, hash-chained log entry.',
    lane: 'Lane: signed change log for moves; the board is a deterministic fold.'
  },
  {
    view: 'todo',
    title: 'Collab todo',
    blurb: 'The classic — a synced list with live cursors, in ~40 lines of app code.',
    lane: 'Lane: structured data via useQuery/useMutate + Awareness for cursors.'
  }
]

function Home() {
  return (
    <>
      <div className="home-grid">
        {DEMOS.map((demo) => (
          <a
            key={demo.view}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit' }}
            href={routeHash(demo.view, randomRoomCode())}
          >
            <h2>{demo.title}</h2>
            <p>{demo.blurb}</p>
            <div className="lane">{demo.lane}</div>
          </a>
        ))}
      </div>
      <p className="footer-note">
        Built on <a href="https://xnet.fyi">xNet</a> — local-first, signed, synced. Each demo
        creates a fresh room; share the URL to invite someone. Rooms live on the public demo hub and
        are periodically evicted.
      </p>
    </>
  )
}

function DemoHost({ route }: { route: DemoRoute }) {
  const config = useMemo(
    () => ({
      authorDID: identity.did,
      signingKey: privateKey,
      identity,
      hubUrl: HUB_URL,
      signalingServers: [HUB_URL],
      hubOptions: { nodeSyncRoom: nodeSyncRoom(route.room) },
      disablePlugins: true
    }),
    [route.room]
  )

  return (
    // Key by view+room: switching rooms tears down the whole client so the
    // relay room, doc rooms, and presence all follow the URL.
    <XNetProvider key={`${route.view}/${route.room}`} config={config}>
      {/* The real xNet DevTools, same as the workbench app: the floating
          toggle (or ⌘⇧D) opens the inspector — watch queries, sync frames,
          and presence flow while you play. */}
      <XNetDevToolsProvider position="bottom" defaultOpen={false}>
        {route.view === 'cursors' && <CursorParty room={route.room} did={identity.did} />}
        {route.view === 'connect-four' && <ConnectFour room={route.room} did={identity.did} />}
        {route.view === 'todo' && <Todo room={route.room} did={identity.did} />}
      </XNetDevToolsProvider>
    </XNetProvider>
  )
}

export function DemosApp() {
  const route = useRoute()
  const title = DEMOS.find((d) => d.view === route.view)?.title

  return (
    <div className="shell">
      <header className="shell-header">
        <h1>
          <a href="#/">xNet demos</a>
          {title ? ` · ${title}` : ''}
        </h1>
        <span className="spacer" />
        {route.view !== 'home' && (
          <>
            <span className="chip" title="Room — share the URL to invite someone">
              room {route.room}
            </span>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href)
              }}
            >
              Copy invite link
            </button>
          </>
        )}
        <span className="chip" title="Your throwaway demo identity (kept in this browser)">
          you: {shortDid(identity.did)}
        </span>
      </header>
      {route.view === 'home' ? <Home /> : <DemoHost route={route} />}
    </div>
  )
}
