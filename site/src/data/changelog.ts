/**
 * Single source of truth for the xNet changelog / "What's New".
 *
 * This is the user-facing record of what shipped — written in plain prose, not
 * commit subjects. It is rendered three ways from this one module:
 *   - the public page  → site/src/pages/changelog/index.astro
 *   - a JSON feed       → site/src/pages/changelog.json.ts   (JSON Feed 1.1)
 *   - an RSS feed       → site/src/pages/changelog.xml.ts
 * The in-app "What's New" surfaces (web PWA + Electron) fetch the JSON feed at
 * https://xnet.fyi/changelog.json and compare each entry `id` against the
 * user's last-seen id.
 *
 * Conventions (enforced by site/scripts/validate-changelog.ts):
 *   - `id` is an ISO date `YYYY-MM-DD`, unique, and entries are newest-first.
 *   - Every entry maps to real shipped work (a merged PR where applicable).
 *   - `summary` leads with the user benefit; `highlights` are user-visible.
 *   - `hero.src` is an absolute site path (/images/…) or an https:// URL
 *     (e.g. a gh-pages visual-capture screenshot).
 * When you ship a user-facing change, prepend an entry here and bump `updated`.
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
  /** ISO date `YYYY-MM-DD`. Doubles as the stable id for "last seen" tracking. */
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

export const updated = 'June 2026'

export const entries: ChangelogEntry[] = [
  {
    id: '2026-06-17',
    date: 'June 17, 2026',
    title: 'Automated changelog & in-app "What’s New"',
    summary:
      'xNet now keeps a changelog you can actually read. Every release is summarized here, on the website, and inside the app — so you always know what changed when a new version lands.',
    highlights: [
      'A public changelog page with a JSON and RSS feed you can subscribe to',
      'An in-app "What’s New" panel that flags updates since your last visit',
      'Release notes on the desktop app are now written in plain language, not raw commit logs',
      'UI screenshots captured by CI can be embedded directly in changelog entries'
    ],
    tags: ['app', 'platform', 'ci'],
    hero: { src: '/images/workbench-dark.png', alt: 'The xNet workbench' },
    images: [
      {
        src: 'https://xnet.fyi/visuals/pr/147/routes/home.png',
        alt: 'The xNet home view',
        caption: 'Home — captured by CI'
      },
      {
        src: '/images/workbench-light.png',
        alt: 'The xNet workbench in light mode',
        caption: 'Workbench (light)'
      }
    ],
    author: { login: 'crs48' },
    pr: 147
  },
  {
    id: '2026-06-16',
    date: 'June 2026',
    title: 'xNet Cloud — managed hub hosting',
    summary:
      'Don’t want to run your own hub? xNet Cloud hosts one for you. A new onboarding flow takes you from signup to a provisioned hub, then lets you claim it from the app.',
    highlights: [
      'Marketing and pricing pages for managed hub hosting',
      'Signup → provision → claim flow',
      'Connect the app to your hosted hub from Settings'
    ],
    tags: ['platform', 'app'],
    author: { login: 'crs48' },
    pr: 140
  },
  {
    id: '2026-06-15',
    date: 'June 2026',
    title: 'Extensibility fabric: one home for plugins, labs & AI',
    summary:
      'Plugins, labs, the AI surface, and the editor are converging into a single extensibility fabric, so a capability built in one place can be reused everywhere.',
    highlights: [
      'Shared trust and consent model across plugins and labs',
      'Plugin contributions and lab tools can be exposed to the AI assistant',
      'Foundations for an AI → Lab → Plugin assembly line'
    ],
    tags: ['plugins', 'ai', 'editor', 'platform'],
    author: { login: 'crs48' },
    pr: 144
  },
  {
    id: '2026-06-14',
    date: 'June 2026',
    title: 'Plugin ecosystem: scaffolding, marketplace & trust',
    summary:
      'Building and sharing plugins is now first-class. A scaffolder gets you from zero to a working plugin in seconds, and an enforceable capability model keeps installs safe.',
    highlights: [
      'xnet plugin scaffold command and an AI "script → plugin" path',
      'Capability enforcement, semver compatibility gates and inter-plugin dependencies',
      'A searchable marketplace index with install-consent prompts'
    ],
    tags: ['plugins', 'platform'],
    author: { login: 'crs48' },
    pr: 142
  },
  {
    id: '2026-06-12',
    date: 'June 2026',
    title: 'On-device dictation',
    summary:
      'Talk to xNet. A new dictation engine turns speech into text locally, with hold-to-talk and private-by-default transcripts.',
    highlights: [
      'Zero-dependency dictation engine with hold-to-talk',
      'Private-by-default transcription with full-text search',
      'Pluggable speech backends (bring-your-own engine)'
    ],
    tags: ['app', 'ai'],
    pr: 136
  },
  {
    id: '2026-06-11',
    date: 'June 2026',
    title: 'xNet AI chat panel works out of the box',
    summary:
      'The in-app AI assistant is wired up end-to-end — the chat panel now connects, picks a sensible model tier automatically, and reports errors honestly.',
    highlights: [
      'Fixed the connection so the assistant responds on a fresh install',
      'Automatic model-tier selection with a clear status badge',
      'Tier preference persists between sessions'
    ],
    tags: ['ai', 'app'],
    author: { login: 'crs48' },
    pr: 137
  },
  {
    id: '2026-06-10',
    date: 'June 2026',
    title: 'Faster, cheaper CI',
    summary:
      'Behind the scenes, the build pipeline got faster and more reliable — which means features reach you sooner.',
    highlights: [
      'Parallelized lint, typecheck and test jobs',
      'Cached browser and native build dependencies'
    ],
    tags: ['ci', 'performance'],
    pr: 141
  },
  {
    id: '2026-06-08',
    date: 'June 2026',
    title: 'Cohesive, feature-complete domain apps',
    summary:
      'CRM, accounting, tasks, experiments and spaces are now fully editable and consistent. Open any record to see every field, with bespoke views where they help.',
    highlights: [
      'Full CRM: contacts, deals, organizations, forecast lanes, quotes and de-dup merge',
      'Finance: account and transaction inspectors, reports tab and budgeting',
      'Tasks: project detail headers and milestone management',
      'A shared inspector substrate (NodePeek + SchemaForm) across every domain'
    ],
    tags: ['crm', 'finance', 'tasks', 'app'],
    hero: { src: '/images/workbench-light.png', alt: 'Domain workspace in xNet' },
    pr: 123
  },
  {
    id: '2026-06-05',
    date: 'June 2026',
    title: 'Native CRM & ERP foundation',
    summary:
      'xNet grew a native CRM — a universal party model, pipelines, deals and activities that reuse the same social and schema primitives as the rest of the app.',
    highlights: [
      'Organizations, contacts, pipelines, deals, products and quotes',
      'Append-only activity timeline and contact de-duplication',
      'vCard import/export and GDPR helpers'
    ],
    tags: ['crm', 'app'],
    pr: 102
  },
  {
    id: '2026-06-04',
    date: 'June 2026',
    title: 'Double-entry accounting',
    summary:
      'Track your money in xNet. A local-first, double-entry ledger brings accounts, transactions, budgets and reconciliation — with CSV/OFX/QIF import.',
    highlights: [
      'Balanced double-entry transactions with integer-precise money',
      'Budgets, reconciliation and chart-of-accounts reports',
      'Import from CSV, OFX and QIF'
    ],
    tags: ['finance', 'app'],
    pr: 101
  },
  {
    id: '2026-06-02',
    date: 'June 2026',
    title: 'Plug-and-play billing (Stripe & Bitcoin)',
    summary:
      'A provider-agnostic billing layer lets xNet apps take payments via Stripe or Bitcoin (BTCPay) without locking into either.',
    highlights: [
      'Stripe and BTCPay adapters behind one payment interface',
      'Signed webhooks with idempotent processing',
      'A useBilling() hook for checkout and subscription status'
    ],
    tags: ['platform'],
    pr: 106
  },
  {
    id: '2026-05-28',
    date: 'May 2026',
    title: 'Screenshots of every UI change, automatically',
    summary:
      'Every pull request that touches the interface now gets before/after screenshots and GIFs captured by CI — the same visuals that can feed this changelog.',
    highlights: [
      'Automatic screenshot, diff and GIF capture for changed UI',
      'A sticky gallery comment on each pull request',
      'Durable galleries that survive after merge'
    ],
    tags: ['ci', 'devtools'],
    pr: 94
  },
  {
    id: '2026-05-20',
    date: 'May 2026',
    title: 'Experiment journal & habit tracker',
    summary:
      'Run personal experiments and track habits in xNet, with streaks, correlations and a verdict engine that stays honest about what the data can and can’t show.',
    highlights: [
      'Metrics, observations and experiments as first-class data',
      'Streak heatmaps and correlation widgets',
      'A "Today" panel for quick logging'
    ],
    tags: ['app'],
    pr: 89
  }
]
