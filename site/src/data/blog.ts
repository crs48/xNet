/**
 * Single source of truth for the xNet blog (exploration 0239).
 *
 * The site has no MDX/content-collection blog; marketing content is authored as
 * `.astro` pages + data modules (see `changelog.ts`, `surveillance.ts`). The blog
 * follows the same grain: each post is a hand-authored, art-directed `.astro` page
 * under `site/src/pages/blog/<slug>.astro`, and this module holds the post
 * **metadata** so the index page and the RSS feed stay in sync with the page.
 *
 * Rendered three ways:
 *   - the index page → site/src/pages/blog/index.astro
 *   - an RSS feed     → site/src/pages/blog/rss.xml.ts
 *   - each post page imports its own `BlogPost` so title/description/date are
 *     single-sourced.
 *
 * Conventions:
 *   - `slug` matches the page filename and the URL (`/blog/<slug>`).
 *   - `pubDate` is an ISO-8601 instant (UTC). Newest-first ordering is by `pubDate`.
 *   - `draft: true` hides a post from the index and the feed (still reachable by URL
 *     during authoring). Production never lists drafts.
 */

export type BlogTag =
  | 'essay'
  | 'philosophy'
  | 'privacy'
  | 'decentralization'
  | 'protocol'
  | 'nature'
  | 'cosmos'

export interface BlogPost {
  /** URL slug; matches `site/src/pages/blog/<slug>.astro`. */
  slug: string
  /** Headline shown on the index card and the post page. */
  title: string
  /** One-line deck shown under the title and used as the feed description. */
  description: string
  /** ISO-8601 UTC instant the post was published. */
  pubDate: string
  /** Display author. */
  author: string
  tags: BlogTag[]
  /** Rough read time in minutes, shown on the card. */
  readingMinutes: number
  /** Optional hero image (absolute site path or https URL) for social cards. */
  hero?: { src: string; alt: string }
  /** Hide from index + feed while authoring. */
  draft?: boolean
}

export const posts: BlogPost[] = [
  {
    slug: 'the-desert-that-feeds-the-forest',
    title: 'The Desert That Feeds the Forest',
    description:
      'Every year a dead desert blows across an ocean and feeds the most alive place on Earth — replacing almost exactly what the rainforest loses. What Saharan dust, the bees nobody watches, and the maintainers nobody thanks teach us about the invisible substrate the open web runs on.',
    pubDate: '2026-06-29T14:00:00Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 13
  },
  {
    slug: 'the-gentlest-furnace',
    title: 'The Gentlest Furnace',
    description:
      'A star carries the energy of a billion bombs and still feels calm from here. What hydrostatic equilibrium — the thermostat that keeps a star from exploding or going cold — teaches us about information, attention, and building technology that burns long instead of burning out.',
    pubDate: '2026-06-28T02:27:04Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'cosmos'],
    readingMinutes: 13
  },
  {
    slug: 'data-should-work-like-soil',
    title: 'Data Should Work Like Soil',
    description:
      'Beneath every forest runs a fungal network — the original internet. What mycelium, the human nervous system, and Tesla’s Warp teach us about building one worth living in, and how to heal one that’s gone sick.',
    pubDate: '2026-06-28T01:23:39Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 12
  },
  {
    slug: 'a-great-pirate-age',
    title: 'A Great Pirate Age for the Internet',
    description:
      'What pirates — the real ones, and the ones in One Piece — can teach us about owning your data. An essay on freedom, self-governance, and why you are the cargo.',
    pubDate: '2026-06-28T00:28:34Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'decentralization'],
    readingMinutes: 11
  }
]

/** Published posts, newest first. Drops drafts. */
export function publishedPosts(): BlogPost[] {
  return posts.filter((p) => !p.draft).sort((a, b) => b.pubDate.localeCompare(a.pubDate))
}

/** Look up a single post by slug (drafts included, so authoring URLs resolve). */
export function postBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug)
}

/** Human-friendly date, e.g. "June 27, 2026", rendered from the ISO instant. */
export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}
