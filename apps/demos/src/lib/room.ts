/**
 * Rooms are URL fragments: xnet.fyi/demos/#/cursors/sunny-fox-42 — the URL is
 * the whole invitation (exploration 0314's "zero onboarding" ingredient).
 * Deterministic node ids per room let every visitor converge on the same
 * shared nodes without any lookup.
 */

const ADJECTIVES = ['sunny', 'brisk', 'mellow', 'wild', 'cosmic', 'tidal', 'amber', 'lucky']
const ANIMALS = ['fox', 'otter', 'heron', 'lynx', 'newt', 'wren', 'mole', 'orca']

export function randomRoomCode(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]
  const n = Math.floor(Math.random() * 90) + 10
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${n}`
}

/** Room codes come from URLs — keep them to a safe slug alphabet. */
export function sanitizeRoomCode(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
}

export type DemoView = 'home' | 'cursors' | 'connect-four' | 'todo'

export interface DemoRoute {
  view: DemoView
  room: string
}

/** Parse `#/<view>/<room>`; missing pieces get defaults (random room). */
export function parseRoute(hash: string): DemoRoute {
  const [view = '', room = ''] = hash.replace(/^#\/?/, '').split('/')
  const clean = sanitizeRoomCode(room)
  const views: DemoView[] = ['cursors', 'connect-four', 'todo']
  if ((views as string[]).includes(view)) {
    return { view: view as DemoView, room: clean || randomRoomCode() }
  }
  return { view: 'home', room: clean || randomRoomCode() }
}

export function routeHash(view: DemoView, room: string): string {
  return view === 'home' ? '#/' : `#/${view}/${room}`
}

/** Deterministic per-room node id — all visitors converge on the same node. */
export function roomNodeId(view: DemoView, room: string): string {
  return `demo/${view}/${room}`
}
