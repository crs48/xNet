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
 *     unique across fragments. The loader sorts newest-first by `mergedAt` (the
 *     PR's actual merge instant, time-of-day precision), so same-day PRs land in
 *     true reverse-chronological order; `id` is only a fallback/tiebreak.
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
  /**
   * Everyone who contributed to the PR (the PR author plus any other commit
   * authors), each a GitHub login surfaced as an avatar + profile link. Filled
   * from the merge event / GitHub API by the stamp workflow and resolve-prs.mjs.
   */
  authors?: ChangelogContributor[]
  /** @deprecated single primary author; superseded by `authors`. Still rendered as a fallback. */
  author?: ChangelogContributor
  /** Originating pull request number, when applicable. */
  pr?: number
  /**
   * ISO-8601 UTC instant the originating PR was merged into `main`
   * (e.g. `"2026-06-17T16:41:38Z"`). This is what entries are ordered by —
   * reverse-chronological with time-of-day precision, so several PRs merged on
   * the same day still appear in the order they actually landed. It's stamped at
   * merge from the merge event by `.github/workflows/stamp-pr-number.yml` and
   * backfilled from the GitHub API at deploy by `scripts/changelog/resolve-prs.mjs`
   * (the safety net). Absent only for an unresolved/legacy fragment, which then
   * falls back to its `id` date prefix for ordering.
   */
  mergedAt?: string
}

/** A GitHub contributor shown on an entry (avatar + link, label is name||login). */
export interface ChangelogContributor {
  login: string
  name?: string
}

// Vite resolves this glob at build time and inlines every fragment's JSON, so
// there is no runtime filesystem read (which would break once this module is
// bundled into dist/). The build-time validator reads the same files via fs.
const fragments = import.meta.glob<ChangelogEntry>('./changelog/*.json', {
  eager: true,
  import: 'default'
})

/**
 * Ordering key in epoch ms: the PR's merge instant (time-of-day precision), so
 * entries land in true reverse-chronological order even when several PRs merged
 * on the same calendar day. When `mergedAt` is absent (a legacy fragment or one
 * whose PR couldn't be resolved), fall back to midnight UTC of the `id` date
 * prefix so it still sorts to roughly the right day.
 */
function mergeOrder(e: ChangelogEntry): number {
  const iso = e.mergedAt ?? `${e.id.slice(0, 10)}T00:00:00Z`
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Newest-first by merge time; `id` (descending) is a stable tiebreak. */
export const entries: ChangelogEntry[] = Object.values(fragments).sort(
  (a, b) => mergeOrder(b) - mergeOrder(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
)

/** The most recent entry's date label, shown in the page footer. */
export const updated = entries[0]?.date ?? 'June 2026'
