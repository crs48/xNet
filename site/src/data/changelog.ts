/**
 * Single source of truth for the xNet changelog / "What's New".
 *
 * Entries are **per-PR fragment files** in `./changelog/*.json` (exploration
 * 0197), loaded and sorted here. One file per change means CI can drop a new
 * entry on merge with no TS-array surgery and no merge conflicts between
 * concurrent PRs. This module is rendered three ways:
 *   - the public page  → site/src/pages/changelog/index.astro
 *   - a JSON feed       → site/src/pages/changelog.json.ts   (JSON Feed 1.1)
 *   - an RSS feed       → site/src/pages/changelog.xml.ts
 * The in-app "What's New" surfaces fetch the JSON feed at
 * https://xnet.fyi/changelog.json and compare each entry `id` against the
 * user's last-seen id.
 *
 * Conventions (enforced by site/scripts/validate-changelog.ts):
 *   - `id` is `YYYY-MM-DD` (optionally `-pr<N>` to disambiguate same-day PRs),
 *     unique across fragments. The loader sorts newest-first by id.
 *   - Every entry maps to real shipped work (a merged PR where applicable).
 *   - `summary` leads with the user benefit; `highlights` are user-visible.
 *   - `hero.src`/`images[].src` is an absolute path (/images/…) or https URL.
 *   - `pr` is optional at author time and ends up set three ways (0197/0202/0203):
 *     `scripts/changelog/new.mjs --pr auto` bakes it when the branch already has a
 *     PR; on merge, `.github/workflows/stamp-pr-number.yml` writes the PR number
 *     (from the merge event) back into source; and `scripts/changelog/resolve-prs.mjs`
 *     fills any remaining gap from git/the GitHub API at deploy (the safety net).
 *     A PR-CI dry run (`resolve-prs.mjs --check`) verifies it pre-merge.
 * To add an entry, run `node scripts/changelog/new.mjs …` (or drop a `<id>.json`
 * file here) and commit it in your PR — the changelog-check workflow requires one.
 */
export type ChangelogTag =
  | 'app'
  | 'crm'
  | 'finance'
  | 'tasks'
  | 'ai'
  | 'plugins'
  | 'editor'
  | 'sync'
  | 'identity'
  | 'platform'
  | 'performance'
  | 'devtools'
  | 'ci'

export interface ChangelogEntry {
  /** `YYYY-MM-DD` (optionally `-pr<N>`). The stable id for "last seen" + anchors. */
  id: string
  /** Human-facing release label shown on the page (e.g. "June 2026"). */
  date: string
  /** One-line headline. */
  title: string
  /** A short paragraph leading with the user benefit. */
  summary: string
  /** User-visible bullet points. */
  highlights: string[]
  tags: ChangelogTag[]
  /** Optional hero image (absolute site path or https URL). */
  hero?: { src: string; alt: string }
  /**
   * Curated gallery images (absolute path or https URL). Shown in addition to
   * any auto-pulled diff-manifest gallery (exploration 0196); use for entries
   * whose PR predates the durable visual capture, or to hand-pick screenshots.
   */
  images?: { src: string; alt: string; caption?: string }[]
  /** Autoplay-muted, click-to-play video clip (replaces a GIF). */
  video?: { src: string; poster: string; alt: string }
  /** Primary author, surfaced as a GitHub avatar + link. */
  author?: { login: string; name?: string }
  /** Originating pull request number, when applicable. */
  pr?: number
}

// Vite resolves this glob at build time and inlines every fragment's JSON, so
// there is no runtime filesystem read (which would break once this module is
// bundled into dist/). The build-time validator reads the same files via fs.
const fragments = import.meta.glob<ChangelogEntry>('./changelog/*.json', {
  eager: true,
  import: 'default'
})

/** Newest-first by id (date prefix, then any `-pr<N>` suffix). */
export const entries: ChangelogEntry[] = Object.values(fragments).sort((a, b) =>
  a.id < b.id ? 1 : a.id > b.id ? -1 : 0
)

/** The most recent entry's date label, shown in the page footer. */
export const updated = entries[0]?.date ?? 'June 2026'
