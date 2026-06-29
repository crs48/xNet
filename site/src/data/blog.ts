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
  | 'economics'

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
    slug: 'the-tip-of-the-hook',
    title: 'The Tip of the Hook',
    description:
      "You write useQuery(TaskSchema) and get a live, local, cryptographically-authorised, syncing database — with no API endpoint, no auth middleware, and no cache to invalidate. A developer's tour of xNet's React hooks on the surface, then a dive beneath the waterline to the SQLite database running in a worker, the priority scheduler, and the signed change log that make “just trust the client” safe. The tip is small on purpose; the iceberg is yours to open.",
    pubDate: '2026-06-29T17:30:00Z',
    author: 'xNet',
    tags: ['essay', 'protocol', 'decentralization'],
    readingMinutes: 14
  },
  {
    slug: 'the-loom-you-can-read',
    title: 'The Loom You Can Read',
    description:
      "The Luddites didn't fear machines — they refused looms they weren't allowed to open. Follow one note, “Buy milk,” all the way through xNet's internals: a file on your own disk, a signed change log, a name you mint instead of an account, and a three-line merge that settles conflicts with no server in the middle. A guided tour of a machine you're allowed to open — written for developers and everyone else at once.",
    pubDate: '2026-06-29T01:09:07Z',
    author: 'xNet',
    tags: ['essay', 'protocol', 'decentralization'],
    readingMinutes: 15
  },
  {
    slug: 'the-forest-and-the-field',
    title: 'The Forest and the Field',
    description:
      'Industrial farming strips the soil to exhaustion and trucks fertility back in by the ton. Surveillance capitalism does the same to the web. Permaculture is the discipline for growing land that feeds itself — and its principles are, almost furrow for furrow, how you regenerate a digital commons instead of strip-mining one.',
    pubDate: '2026-06-28T23:39:38Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 14
  },
  {
    slug: 'the-right-to-say-no',
    title: 'The Right to Say No',
    description:
      "A musician on YouTube argues the economy quietly changed from growth to extraction, and the real prize isn't your money — it's your ability to refuse. He's mostly right. Here's the part software can actually give back.",
    pubDate: '2026-06-28T22:10:50Z',
    author: 'xNet',
    tags: ['essay', 'philosophy', 'economics'],
    readingMinutes: 13
  },
  {
    slug: 'the-desert-that-feeds-the-forest',
    title: 'The Desert That Feeds the Forest',
    description:
      'Every year a dead desert blows across an ocean and feeds the most alive place on Earth — replacing almost exactly what the rainforest loses. What Saharan dust, the bees nobody watches, and the maintainers nobody thanks teach us about the invisible substrate the open web runs on.',
    pubDate: '2026-06-28T21:46:46Z',
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
