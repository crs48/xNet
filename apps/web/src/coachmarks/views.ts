/**
 * Map a router pathname to a stable coachmark view id (exploration 0206).
 *
 * Tips are keyed by these ids, so the first segment of the path is the unit
 * of "you just opened view X for the first time". Dynamic routes collapse to
 * one id (`/doc/abc` and `/doc/xyz` are both `page`).
 *
 * Pure and dependency-free — unit-tested directly.
 */

/** First path segment → view id. Segments not listed pass through unchanged. */
const SEGMENT_TO_VIEW: Record<string, string> = {
  '': 'home',
  db: 'database',
  doc: 'page',
  canvas: 'canvas',
  dashboard: 'dashboard',
  map: 'map',
  view: 'savedview',
  channel: 'channel',
  tag: 'tag',
  person: 'person',
  lab: 'lab',
  space: 'space'
  // crm, data, tasks, finance, experiments, discover, requests, analytics,
  // settings, welcome … map to themselves.
}

export function viewIdForPath(pathname: string): string {
  const segment = pathname.replace(/^\/+/, '').split('/')[0] ?? ''
  return SEGMENT_TO_VIEW[segment] ?? segment
}
