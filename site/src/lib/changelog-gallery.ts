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

const VISUALS_BASE = 'https://xnet.fyi/visuals/pr'
const REPO = 'https://github.com/crs48/xNet'

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
 * Fetch + shape a PR's gallery. Returns null on 404 / offline / empty so the
 * caller degrades to the curated hero. Never throws.
 */
export async function loadPrGallery(pr: number, cap = 12): Promise<PrGallery | null> {
  const base = `${VISUALS_BASE}/${pr}`
  let manifest: DiffManifest
  try {
    const res = await fetch(`${base}/diff-manifest.json`)
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
