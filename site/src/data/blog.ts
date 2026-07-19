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
 *
 * Essay backlog (candidates researched but not yet written):
 *   - "The Railroad and the Airline" — frontier economics without enclosure:
 *     railroad land grants, the airline margin trap, dumb pipes, and the
 *     Georgist operator position (exploration 0351). Tags: essay, economics.
 *   - "The Landlord's Game Was About Enclosure" — the lineage from Magie's
 *     board to the Inclosure Acts, common rights as the thing actually lost,
 *     and ground rent as the oldest unpriced column (explorations 0351, 0368).
 *     Tags: essay, economics, philosophy.
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
  | 'personal'

/** Registered blog authors; posts reference these by id (exploration 0269). */
export type BlogAuthorId = 'crs48' | 'claude'

export interface BlogAuthor {
  id: BlogAuthorId
  /** Display name shown in the byline. */
  name: string
  /** Profile link (GitHub for humans; product page for AI agents). */
  href?: string
  /**
   * First-party avatar path under `site/public/` — never a hotlink. Several
   * essays promise "this page loads nothing third-party", so avatars are
   * vendored assets served from the site's own origin.
   */
  avatar: string
  /** Marks an AI co-author; drives the "with …" byline treatment. */
  ai?: boolean
}

const AUTHORS: Record<BlogAuthorId, BlogAuthor> = {
  crs48: {
    id: 'crs48',
    name: 'crs48',
    href: 'https://github.com/crs48',
    avatar: '/blog/authors/crs48.jpg'
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    href: 'https://claude.com/claude-code',
    avatar: '/blog/authors/claude.svg',
    ai: true
  }
}

export interface BlogPost {
  /** URL slug; matches `site/src/pages/blog/<slug>.astro`. */
  slug: string
  /** Headline shown on the index card and the post page. */
  title: string
  /** One-line deck shown under the title and used as the feed description. */
  description: string
  /** ISO-8601 UTC instant the post was published. */
  pubDate: string
  /** Authors shown in the byline, humans first. */
  authors: BlogAuthorId[]
  tags: BlogTag[]
  /** Rough read time in minutes, shown on the card. */
  readingMinutes: number
  /** Optional hero image (absolute site path or https URL) for social cards. */
  hero?: { src: string; alt: string }
  /** Hide from index + feed while authoring. */
  draft?: boolean
}

const posts: BlogPost[] = [
  {
    slug: 'the-harvest-you-can-count',
    title: 'The Harvest You Can Count',
    description:
      'A video claims every food forest on Earth was deliberately erased. It ' +
      'is wrong, and it is pointing at something real. Layered perennial food ' +
      'systems existed on every inhabited continent, and most of them lost — ' +
      'but not the way the romantic version tells it. Grain genuinely won on ' +
      'calories and on labour. What the forest was better at was variance, ' +
      'soil carbon, micronutrients and independence from inputs, and no ' +
      'ledger has ever had a column for any of them. On appropriability, why ' +
      'a tenant cannot plant a ten-year asset, and why a local-first tool is ' +
      'illegible to a procurement department for exactly the same reason.',
    pubDate: '2026-08-03T09:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'economics', 'philosophy'],
    readingMinutes: 16
  },
  {
    slug: 'rig-the-game-or-play',
    title: 'Rig the Game or Play',
    description:
      'The board game that taught a century of children to build monopolies ' +
      'was patented in 1904 to show that monopolies are unjust — and the ' +
      'cautionary rule set is the one that sold thirty million copies. On ' +
      'runaway leaders and the dead zone, why every table removes the ' +
      'auction and adds the Free Parking jackpot, what Hayek meant by ' +
      'competition as a discovery procedure, and why the rules of a rigged ' +
      'game are usually exposed by someone who got sued rather than by ' +
      'anyone’s transparency report.',
    pubDate: '2026-07-20T09:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'economics', 'philosophy'],
    readingMinutes: 14
  },
  {
    slug: 'the-worlds-greatest-record-store',
    title: 'The World’s Greatest Record Store',
    description:
      'In 2004 a pink website with a pig mascot became the most complete ' +
      'music collection on the internet — run by one person, governed by its ' +
      'members, and killed by a police raid. Its community rediscovered ' +
      'Elinor Ostrom’s commons principles from scratch and was denied only ' +
      'the one no tracker could have: the right to exist. On ratio economies ' +
      'and the anxiety they bred, scenius and the ground scenes rent, and ' +
      'the promise the Palace couldn’t make that local-first software can — ' +
      'the scene outlives the server.',
    pubDate: '2026-07-19T17:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'decentralization', 'economics'],
    readingMinutes: 14
  },
  {
    slug: 'palimpsest',
    title: 'Palimpsest',
    description:
      'Overwriting was always an economy measure. The economy changed. In ' +
      '1229 a scribe scraped the only copy of Archimedes’ Method to reuse ' +
      'the parchment; it took a particle accelerator to partially undo the ' +
      'knife. Every UPDATE in every mutable database is that knife — and ' +
      'for the first time we can price it: microseconds, half a kilobyte, ' +
      'pennies a year. On what a signed, append-only history actually ' +
      'costs, measured on the shipped code, and why the trade that made ' +
      'erasure rational has permanently inverted.',
    pubDate: '2026-07-18T23:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'protocol', 'economics', 'philosophy'],
    readingMinutes: 13
  },
  {
    slug: 'tree-rings',
    title: 'Tree Rings',
    description:
      'A tree never edits a ring: growth accretes on the outside, and the ' +
      'whole history stays legible in the grain. Rich Hickey has spent two ' +
      'decades arguing software should be built the same way — values that ' +
      'accrete, not places that overwrite. On Effective Programs and its ' +
      'pyramid of what actually costs money, Simple Made Easy, the epochal ' +
      'time model — what taking the middle of that pyramid seriously looks ' +
      'like in a working protocol, and the three places we deliberately ' +
      'depart from the hammock.',
    pubDate: '2026-07-18T21:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'protocol'],
    readingMinutes: 14
  },
  {
    slug: 'people-in-disguise',
    title: 'People in Disguise',
    description:
      'For forty years, one man has been making the same argument from ' +
      'inside the machine: a VR pioneer, a working musician, Microsoft’s ' +
      'in-house heretic — insisting that digital information is really just ' +
      'people in disguise. On Jaron Lanier’s long war against the siren ' +
      'servers, what his ideas look like when you actually build them — and ' +
      'the one prescription we deliberately refuse.',
    pubDate: '2026-07-18T17:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'privacy', 'economics'],
    readingMinutes: 14
  },
  {
    slug: 'clutch-power',
    title: 'Clutch Power',
    description:
      'On 28 January 1958 the LEGO Group patented not a brick but a ' +
      'coupling — stud and tube, and with them clutch power: a grip firm ' +
      'enough to build with that still comes apart by hand. The web never ' +
      'got a coupling for data, so every app moulds pieces that fit only ' +
      'its own set, and the APIs that promised otherwise were drawbridges. ' +
      'On the four frozen interfaces xNet ships instead — one node shape, ' +
      'one namespace anyone can mint into, one merge rule, one permission ' +
      'algebra — and why the grip matters as much as the snap: nobody ' +
      'plays with your bricks unless you say so.',
    pubDate: '2026-07-14T17:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'protocol', 'decentralization', 'philosophy'],
    readingMinutes: 14
  },
  {
    slug: 'weights-you-can-hold',
    title: 'Weights You Can Hold',
    description:
      'Graduates are booing AI executives at commencement, then going home to ' +
      'run open-weight models on their own laptops. Two video essays, one ' +
      'quiet revolution: a generation trading rented everything for things it ' +
      'can hold — model weights, assets, film cameras, businesses of its own — ' +
      'and what that exit means for who owns your software.',
    pubDate: '2026-07-10T17:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'economics', 'privacy', 'decentralization'],
    readingMinutes: 13
  },
  {
    slug: 'timeout',
    title: 'Timeout',
    description:
      'A personal essay on autism, dissociation, and the network I dreamed ' +
      'while I was away from my body. The word has three meanings — the ' +
      'punishment corner, the huddle a team calls for itself, and the quiet ' +
      'that falls when a peer stops answering — and I have lived in all ' +
      'three. On finding out at thirty-five, on the years of taking ' +
      'everything in from a distance, and on discovering that the protocol I ' +
      'built treats going quiet exactly the way I needed to be treated: a ' +
      'timeout is a duration, not a verdict, and when the peer comes back, ' +
      'the log catches it up on everything it missed.',
    pubDate: '2026-07-08T17:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'personal', 'philosophy'],
    readingMinutes: 13
  },
  {
    slug: 'the-vault-and-the-view',
    title: 'The Vault and the View',
    description:
      'When Google Reader died, everyone got an export — and discovered the ' +
      'file was a brick, shaped for a renderer that no longer existed. The ' +
      'modern app is a vault: it holds your data and the only window onto it. ' +
      'But the vault is a twenty-five-year detour, not the tradition — from ' +
      'Codd’s data independence through Solid’s pods to local-first and “apps ' +
      'as views, not vaults”, five decades of people have insisted the data is ' +
      'the ground and the software is the weather. On that lineage, why the ' +
      'first pod-shaped attempt stalled, how xNet ships the inversion — and ' +
      'why AI-cheap views make user-owned data the only stable ground left.',
    pubDate: '2026-07-07T21:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'decentralization', 'protocol'],
    readingMinutes: 14
  },
  {
    slug: 'the-workshop-and-the-walled-garden',
    title: 'The Workshop and the Walled Garden',
    description:
      'DotA was a custom map. Counter-Strike was a mod. The battle royale came ' +
      'from a photographer tinkering with a military sim. Modding built half of ' +
      'modern gaming — then the modern app welded its doors shut, with reasons ' +
      'that are half sincere and half convenient. On what the walled garden ' +
      'actually costs, why the fix is scoping authority rather than banning ' +
      'code, and what software looks like when the application is just a view ' +
      'over data you own — especially now that anyone can cook.',
    pubDate: '2026-07-05T23:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'decentralization'],
    readingMinutes: 14
  },
  {
    slug: 'hand-on-the-tiller',
    title: 'Hand on the Tiller',
    description:
      'Everyone is arguing about one alignment problem: will the AI want what we ' +
      'want? But alignment is a stack — physics, planet, society, technology, AI — ' +
      'and we are bolting an aligned machine onto a civilization that steers by the ' +
      'wrong stars. The oldest word for the fix is the root of “cybernetics” and ' +
      '“govern”: the steersman, correcting course a hundred times a minute. What it ' +
      'takes to actually hold a course — and the small, real instruments a piece of ' +
      'software can hand back.',
    pubDate: '2026-07-03T15:00:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'decentralization'],
    readingMinutes: 15
  },
  {
    slug: 'the-tip-of-the-hook',
    title: 'The Tip of the Hook',
    description:
      "You write useQuery(TaskSchema) and get a live, local, cryptographically-authorised, syncing database — with no API endpoint, no auth middleware, and no cache to invalidate. A developer's tour of xNet's React hooks on the surface, then a dive beneath the waterline to the SQLite database running in a worker, the priority scheduler, and the signed change log that make “just trust the client” safe. The tip is small on purpose; the iceberg is yours to open.",
    pubDate: '2026-06-29T17:30:00Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'protocol', 'decentralization'],
    readingMinutes: 14
  },
  {
    slug: 'the-loom-you-can-read',
    title: 'The Loom You Can Read',
    description:
      "The Luddites didn't fear machines — they refused looms they weren't allowed to open. Follow one note, “Buy milk,” all the way through xNet's internals: a file on your own disk, a signed change log, a name you mint instead of an account, and a three-line merge that settles conflicts with no server in the middle. A guided tour of a machine you're allowed to open — written for developers and everyone else at once.",
    pubDate: '2026-06-29T01:09:07Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'protocol', 'decentralization'],
    readingMinutes: 15
  },
  {
    slug: 'the-forest-and-the-field',
    title: 'The Forest and the Field',
    description:
      'Industrial farming strips the soil to exhaustion and trucks fertility back in by the ton. Surveillance capitalism does the same to the web. Permaculture is the discipline for growing land that feeds itself — and its principles are, almost furrow for furrow, how you regenerate a digital commons instead of strip-mining one.',
    pubDate: '2026-06-28T23:39:38Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 14
  },
  {
    slug: 'the-right-to-say-no',
    title: 'The Right to Say No',
    description:
      "A musician on YouTube argues the economy quietly changed from growth to extraction, and the real prize isn't your money — it's your ability to refuse. He's mostly right. Here's the part software can actually give back.",
    pubDate: '2026-06-28T22:10:50Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'economics'],
    readingMinutes: 13
  },
  {
    slug: 'the-desert-that-feeds-the-forest',
    title: 'The Desert That Feeds the Forest',
    description:
      'Every year a dead desert blows across an ocean and feeds the most alive place on Earth — replacing almost exactly what the rainforest loses. What Saharan dust, the bees nobody watches, and the maintainers nobody thanks teach us about the invisible substrate the open web runs on.',
    pubDate: '2026-06-28T21:46:46Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 13
  },
  {
    slug: 'the-gentlest-furnace',
    title: 'The Gentlest Furnace',
    description:
      'A star carries the energy of a billion bombs and still feels calm from here. What hydrostatic equilibrium — the thermostat that keeps a star from exploding or going cold — teaches us about information, attention, and building technology that burns long instead of burning out.',
    pubDate: '2026-06-28T02:27:04Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'cosmos'],
    readingMinutes: 13
  },
  {
    slug: 'data-should-work-like-soil',
    title: 'Data Should Work Like Soil',
    description:
      'Beneath every forest runs a fungal network — the original internet. What mycelium, the human nervous system, and Tesla’s Warp teach us about building one worth living in, and how to heal one that’s gone sick.',
    pubDate: '2026-06-28T01:23:39Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'nature'],
    readingMinutes: 12
  },
  {
    slug: 'a-great-pirate-age',
    title: 'A Great Pirate Age for the Internet',
    description:
      'What pirates — the real ones, and the ones in One Piece — can teach us about owning your data. An essay on freedom, self-governance, and why you are the cargo.',
    pubDate: '2026-06-28T00:28:34Z',
    authors: ['crs48', 'claude'],
    tags: ['essay', 'philosophy', 'decentralization'],
    readingMinutes: 11
  }
]

/** Published posts, newest first. Drops drafts. */
export function publishedPosts(): BlogPost[] {
  return posts.filter((p) => !p.draft).sort((a, b) => b.pubDate.localeCompare(a.pubDate))
}

/**
 * Published posts in reading (series) order: oldest first. The blog is written
 * as a running series, so the natural way to read it is front-to-back — the
 * reverse of the index's newest-first listing.
 */
function seriesOrder(): BlogPost[] {
  return publishedPosts().reverse()
}

/**
 * Neighbours of a post within the published series, in reading order.
 * `previous` is the older post published just before this one; `next` is the
 * newer post published just after it — so following `next` walks the series
 * front-to-back. Either is `undefined` at the ends of the series, and both are
 * `undefined` for a draft or unknown slug (drafts aren't part of the series).
 */
export function seriesNeighbors(slug: string): { previous?: BlogPost; next?: BlogPost } {
  const order = seriesOrder()
  const i = order.findIndex((p) => p.slug === slug)
  if (i === -1) return {}
  return {
    previous: i > 0 ? order[i - 1] : undefined,
    next: i < order.length - 1 ? order[i + 1] : undefined
  }
}

/** Look up a single post by slug (drafts included, so authoring URLs resolve). */
export function postBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug)
}

/** Resolve a post's author ids to full registry entries, in declared order. */
export function postAuthors(post: BlogPost): BlogAuthor[] {
  return post.authors.map((id) => AUTHORS[id])
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
