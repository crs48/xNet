/**
 * Build-time loader that turns a merged PR's durable visual-capture manifest
 * (exploration 0196) into a changelog gallery. For any entry with a `pr`, the
 * page fetches https://xnet.fyi/visuals/pr/<pr>/diff-manifest.json at SSG time
 * and renders the captured screenshots — so the changelog shows the actual UI
 * that changed, with zero per-entry curation.
 *
 * Only PRs merged after exploration 0189 have a durable manifest; older PRs
 * (and offline builds) return null and the caller falls back to hero/images[].
 */

// Overridable so the fetch path is testable against a local/blackhole host, and
// so a broken production site can be taken out of the build loop in a pinch
// (CHANGELOG_GALLERIES=off skips the fetches entirely — every entry falls back
// to its curated hero).
const VISUALS_BASE = process.env.CHANGELOG_VISUALS_BASE || 'https://xnet.fyi/visuals/pr'
const GALLERIES_ENABLED = process.env.CHANGELOG_GALLERIES !== 'off'
const REPO = 'https://github.com/crs48/xNet'

/** Concurrent in-flight manifest fetches. See loadPrGalleries. */
const CONCURRENCY = 8
/** Wall-clock budget for the whole gallery phase, across all entries. */
const TOTAL_BUDGET_MS = 60_000

interface DiffSurface {
  id: string
  title?: string
  name?: string
  label?: string
  status?: 'new' | 'changed' | 'unchanged'
  before?: string
  after?: string
  diff?: string
  gif?: string
  mp4?: string
  poster?: string
}

interface DiffManifest {
  stories?: DiffSurface[]
  routes?: DiffSurface[]
  flows?: DiffSurface[]
}

export interface GalleryImage {
  src: string
  alt: string
  /** Present for surfaces that changed vs. the baseline. */
  before?: string
  diff?: string
}

export interface GalleryVideo {
  mp4: string
  poster: string
  alt: string
}

export interface PrGallery {
  /** New surfaces + changed surfaces (changed ones carry `before`/`diff`). */
  images: GalleryImage[]
  videos: GalleryVideo[]
  prUrl: string
  galleryUrl: string
  count: number
}

function caption(s: DiffSurface): string {
  return s.label || [s.title, s.name].filter(Boolean).join(' — ') || s.id
}

/**
 * Fetch + shape a PR's gallery. Returns null on 404 / offline / empty / timeout
 * so the caller degrades to the curated hero. Never throws. The 5s timeout
 * bounds the build-time fetch (these run as `Promise.all` over every entry in
 * index.astro) so a slow or hung host can never stall the production deploy
 * (exploration 0203).
 */
export async function loadPrGallery(pr: number, cap = 12): Promise<PrGallery | null> {
  if (!GALLERIES_ENABLED) return null
  const base = `${VISUALS_BASE}/${pr}`
  let manifest: DiffManifest
  try {
    const res = await fetch(`${base}/diff-manifest.json`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    manifest = (await res.json()) as DiffManifest
  } catch {
    return null
  }

  const surfaces = [...(manifest.stories ?? []), ...(manifest.routes ?? [])].filter(
    (s) => s.status !== 'unchanged' && Boolean(s.after)
  )

  const images: GalleryImage[] = surfaces.slice(0, cap).map((s) => ({
    src: `${base}/${s.after}`,
    alt: caption(s),
    ...(s.status === 'changed' && s.before ? { before: `${base}/${s.before}` } : {}),
    ...(s.diff ? { diff: `${base}/${s.diff}` } : {})
  }))

  const videos: GalleryVideo[] = (manifest.flows ?? [])
    .filter((f) => f.mp4 && f.poster)
    .map((f) => ({ mp4: `${base}/${f.mp4}`, poster: `${base}/${f.poster}`, alt: caption(f) }))

  const count = images.length + videos.length
  if (count === 0) return null

  return { images, videos, prUrl: `${REPO}/pull/${pr}`, galleryUrl: base, count }
}

/**
 * Resolve galleries for a whole changelog in one bounded pass.
 *
 * The changelog page used to do `Promise.all(entries.map(loadPrGallery))`, which
 * with 246 entries opened 246 simultaneous connections to xnet.fyi — the site
 * fetching itself at build time. On CI that burst hung, and once the sockets
 * were torn down nothing ref'd was left on the event loop, so node drained and
 * `astro build` EXITED 0 mid-prerender: no error, no stack, just a truncated
 * build. dist/ kept Astro's intermediate server output and lost index.html and
 * every route after /changelog, which the deploy then published over gh-pages
 * (2026-07-18, gh-pages 07383a172 — the homepage was gone for ~50 minutes).
 *
 * Three properties make that unreachable now:
 *   - at most CONCURRENCY sockets are open at once;
 *   - a ref'd keep-alive timer spans the whole phase, so the event loop can
 *     never drain out from under a pending fetch and exit silently;
 *   - a total budget caps the phase, after which the rest resolve to null.
 *
 * Fail-open throughout: a null gallery just means the entry renders its curated
 * hero. A degraded xnet.fyi must never be able to block redeploying xnet.fyi.
 */
export async function loadPrGalleries(prs: (number | undefined)[], cap = 12): Promise<(PrGallery | null)[]> {
  const results: (PrGallery | null)[] = new Array(prs.length).fill(null)
  if (!GALLERIES_ENABLED) {
    console.log('[changelog] galleries disabled (CHANGELOG_GALLERIES=off) — using curated heroes')
    return results
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS
  const pending = prs.map((pr, i) => ({ pr, i })).filter((e): e is { pr: number; i: number } => typeof e.pr === 'number')

  let resolved = 0
  let skipped = 0

  // Ref'd so node keeps the loop alive for the whole phase — this is what stops
  // a stalled fetch from turning into a silent exit-0 mid-build.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    let cursor = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length) {
        const { pr, i } = pending[cursor++]
        if (Date.now() > deadline) {
          skipped++
          continue
        }
        const gallery = await loadPrGallery(pr, cap)
        results[i] = gallery
        if (gallery) resolved++
      }
    })
    await Promise.all(workers)
  } finally {
    clearInterval(keepAlive)
  }

  const detail = skipped > 0 ? ` (${skipped} skipped — ${TOTAL_BUDGET_MS / 1000}s budget exhausted)` : ''
  console.log(`[changelog] galleries: ${resolved}/${pending.length} resolved${detail}`)

  return results
}
