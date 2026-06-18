/**
 * Pure mapping: changed files -> the set of UI targets to capture.
 *
 * No I/O, no deps -- so it is trivially unit-testable (see capture-set.test.mjs)
 * and the workflow can trust it to be deterministic. The CLI wrapper
 * (changed-capture-set.mjs) feeds it the git diff, the Storybook index, and the
 * route/flow manifest.
 */

/** Strip a leading `./` and normalize separators so git paths and Storybook
 * `importPath`s compare equal. */
export function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Minimal glob -> RegExp supporting `**`, `*`, and `?`. Anchored. Tokenize into
 * glob metacharacters or literal runs, then map metas to regex and escape the
 * literals -- avoids both a per-char loop and any re-expansion of emitted `*`s.
 */
const GLOB_TOKENS = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' }
export function globToRegExp(glob) {
  const tokens = normalizePath(glob).match(/\*\*\/|\*\*|\*|\?|[^*?]+/g) ?? []
  const re = tokens.map((t) => GLOB_TOKENS[t] ?? t.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('')
  return new RegExp('^' + re + '$')
}

export function matchesAny(file, globs) {
  const f = normalizePath(file)
  return (globs ?? []).some((glob) => globToRegExp(glob).test(f))
}

/** Directory portion of a path, '' for a bare filename. */
function dirOf(p) {
  const n = normalizePath(p)
  const i = n.lastIndexOf('/')
  return i === -1 ? '' : n.slice(0, i)
}

/**
 * @param {object} input
 * @param {string[]} input.changedFiles               git diff --name-only
 * @param {Array<{id,title,name,importPath}>} input.storyEntries  Storybook index entries (type === 'story')
 * @param {Array<{id,label,path,globs}>} input.routeManifest
 * @param {Array<{id,label,globs}>} input.flowManifest
 * @param {object} [opts]
 * @param {boolean} [opts.matchSiblingComponents=true]  capture a story when a file co-located with it changed
 * @param {string}  [opts.homeRouteId='home']           fallback route when web UI changed but no route matched
 * @param {RegExp}  [opts.webUiPattern]                 what counts as "a web UI change" for the fallback
 *   (app source + shared `packages/ui` source, since `home` no longer globs either directly)
 * @returns {{stories:Array, routes:Array, flows:Array}}
 */
export function computeCaptureSet(input, opts = {}) {
  const { changedFiles = [], storyEntries = [], routeManifest = [], flowManifest = [] } = input
  const {
    matchSiblingComponents = true,
    homeRouteId = 'home',
    // App source OR shared `packages/ui` source. `home` deliberately no longer
    // globs `apps/web/src/components/**`/`packages/ui/**` (that false-matched
    // every domain surface onto `/` -- see exploration 0191), so the home
    // fallback is the only safety net for a generic UI change that maps to no
    // specific route and has no story; it must still recognize ui/ changes.
    webUiPattern = /^(?:apps\/web\/src|packages\/ui\/src)\/.*\.(tsx|css)$/
  } = opts

  const changed = changedFiles.map(normalizePath)
  const changedSet = new Set(changed)
  const changedDirs = new Set(changed.map(dirOf))

  // --- Stories: importPath changed, or a co-located component changed. ---
  const storyIsAffected = (entry) => {
    const imp = normalizePath(entry.importPath)
    return changedSet.has(imp) || (matchSiblingComponents && changedDirs.has(dirOf(imp)))
  }
  const stories = storyEntries.filter(storyIsAffected).map((entry) => ({
    kind: 'story',
    id: entry.id,
    title: entry.title,
    name: entry.name,
    importPath: normalizePath(entry.importPath)
  }))

  // --- Routes: any changed file matches the route's globs. ---
  const routes = routeManifest
    .filter((route) => changed.some((f) => matchesAny(f, route.globs)))
    .map((route) => ({ kind: 'route', id: route.id, label: route.label, path: route.path }))

  // --- Flows: any changed file matches the flow's globs. ---
  const flows = flowManifest
    .filter((flow) => changed.some((f) => matchesAny(f, flow.globs)))
    .map((flow) => ({ kind: 'flow', id: flow.id, label: flow.label }))

  // Fallback: web UI changed but NOTHING specific matched (no route, no story,
  // no flow) -> capture home so the reviewer still sees the shell the change
  // lives in, AND record why. Without this signal the home shot diffs clean
  // against the baseline and the comment reports "no visual differences" -- a
  // coverage gap made indistinguishable from a no-op (exploration 0200, the
  // PR #174 chat-redesign miss). The comment uses `fallbackUsed`/`unmappedFiles`
  // to flag the gap instead. Tightened from the old `routes.length === 0`: a
  // story or flow match is "something specific", so home is no longer piled on.
  const webUiChanged = changed.some((f) => webUiPattern.test(f))
  let fallbackUsed = false
  let unmappedFiles = []
  if (webUiChanged && routes.length === 0 && stories.length === 0 && flows.length === 0) {
    const home = routeManifest.find((r) => r.id === homeRouteId)
    if (home) {
      routes.push({ kind: 'route', id: home.id, label: home.label, path: home.path })
      fallbackUsed = true
      unmappedFiles = changed.filter((f) => webUiPattern.test(f)).sort()
    }
  }

  const byId = (a, b) => String(a.id).localeCompare(String(b.id))
  return {
    stories: stories.sort(byId),
    routes: routes.sort(byId),
    flows: flows.sort(byId),
    fallbackUsed,
    unmappedFiles
  }
}

export function captureSetIsEmpty(set) {
  return set.stories.length === 0 && set.routes.length === 0 && set.flows.length === 0
}
