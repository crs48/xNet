/**
 * xNet Cloud pricing — the marketing site's view of the managed-hub offering.
 *
 * Single source for the /cloud and /cloud/pricing pages, kept apart from the
 * markup so a price change is a one-line edit (same pattern as roadmap.ts and
 * compare.ts). These numbers MIRROR the real catalog — `PLAN_CATALOG` in the MIT
 * `@xnetjs/entitlements` package and the illustrative `PLAN_PRICING` scenarios in
 * the FSL `@xnetjs/cloud` cost model — but live here as plain data so the static
 * site never imports the source-available `@xnetjs/cloud` package into its build.
 *
 * When the catalog prices change, update them here too (and the dashboard's
 * PRICE_BY_PLAN map). See docs/explorations/0192_[_]_XNET_CLOUD_ONBOARDING_AND_UI_HOSTING.md
 */

/** Origin of the xNet Cloud control plane (auth callback, checkout, dashboard). */
const CLOUD_ORIGIN = 'https://cloud.xnet.fyi'

/** Deep-link into the WorkOS AuthKit sign-in, carrying the chosen plan. */
export function startUrl(plan: string): string {
  return `${CLOUD_ORIGIN}/auth/start?plan=${encodeURIComponent(plan)}`
}

export interface PricingTier {
  id: 'demo' | 'personal' | 'family' | 'team' | 'community' | 'enterprise'
  name: string
  tagline: string
  /** Display price; `null` for free, `'custom'` for contact-sales. */
  price: { amount: number; unit: string; sub?: string } | 'free' | 'custom'
  storage: string
  seats: string
  /** Tenant isolation tier (from PLAN_CATALOG) — the "what you actually get". */
  isolation: string
  highlights: string[]
  cta: { label: string; href: string }
  /** Visually emphasize this tier as the recommended default. */
  featured?: boolean
}

export const updated = 'August 2026'

/**
 * Public-facing tiers, cheapest → richest.
 *
 * `community` is on the grid because the Charter names it as the receipt for
 * "no per-member pricing on communities", and a receipt nobody can buy is not
 * one (exploration 0436 G7). `company` stays off — it is an enterprise-shaped
 * contract sale and goes through the same contact lane.
 *
 * Every claim in this file must map to an enforcing code path. This page ran
 * ahead of the control plane once — advertising per-seat billing against a
 * checkout that hard-coded `quantity: 1`, and a 99.9% figure the catalog gave
 * Team no objective for — and `apps/cloud/src/pricing-claims.test.ts` now
 * checks it on every run.
 */
export const PRICING: PricingTier[] = [
  {
    id: 'demo',
    name: 'Free',
    tagline: 'Kick the tires on a shared hub.',
    price: 'free',
    storage: '10 MiB',
    seats: '1 person',
    isolation: 'Pooled (shared) hub',
    highlights: [
      'No card required',
      'Passkey identity, fully local-first',
      'Sync across your own devices',
      'Upgrade any time — your data comes with you'
    ],
    cta: { label: 'Start free', href: startUrl('demo') }
  },
  {
    id: 'personal',
    name: 'Personal',
    tagline: 'Your own dedicated hub, always on call.',
    price: { amount: 5, unit: '/mo', sub: 'billed annually ($50/yr)' },
    storage: '25 GiB',
    seats: '1 person',
    isolation: 'Dedicated hub (scale-to-zero)',
    highlights: [
      'A hub that is yours alone',
      'Managed AI gateway included',
      'Encrypted backup to object storage',
      'Full-text search & relay'
    ],
    cta: { label: 'Get Personal', href: startUrl('personal') },
    featured: true
  },
  {
    id: 'family',
    name: 'Family',
    tagline: 'Share a hub with the people you trust.',
    price: { amount: 15, unit: '/mo' },
    storage: '250 GiB',
    seats: 'Up to 5 people',
    isolation: 'Dedicated hub (scale-to-zero)',
    highlights: [
      'Everything in Personal',
      '5 people, one bill',
      'Invite from your dashboard — everyone keeps their own keys',
      'Generous storage for media'
    ],
    cta: { label: 'Get Family', href: startUrl('family') }
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'A warm hub for collaborators who are always on.',
    price: { amount: 12, unit: '/seat/mo', sub: 'from $36/mo (3 seats)' },
    storage: '100 GiB',
    seats: 'From 3 seats',
    isolation: 'Dedicated warm hub (no cold start)',
    highlights: [
      'Always-warm hub — instant sync',
      'Per-seat billing, add seats any time',
      'Roles, grants & shared workspaces',
      'Best-effort availability, measured on our status page'
    ],
    cta: { label: 'Get Team', href: startUrl('team') }
  },
  {
    id: 'community',
    name: 'Community',
    tagline: 'Host a community without paying per member.',
    price: { amount: 49, unit: '/mo' },
    storage: '500 GiB',
    seats: 'Unlimited members',
    isolation: 'Dedicated project hub (always warm)',
    highlights: [
      'Flat price — never per member',
      'Members are unlimited and uncounted',
      '99.9% availability objective',
      'Generous storage, concurrency and AI budget'
    ],
    cta: { label: 'Get Community', href: startUrl('community') }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Region-pinned, SSO, and a contract.',
    price: 'custom',
    storage: '5 TiB+',
    seats: '25+ seats',
    isolation: 'Region-pinned dedicated deployment',
    highlights: [
      'Data residency — your hub pinned to a region',
      'Custom SLA & support',
      'Audit logging & admin controls',
      'SSO — talk to us about your identity provider'
    ],
    cta: { label: 'Contact sales', href: '/cloud#enterprise' }
  }
]

/** How onboarding actually works, surfaced on the /cloud page. */
export interface OnboardingStep {
  n: number
  title: string
  body: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    n: 1,
    title: 'Sign up',
    body: 'Sign in with WorkOS AuthKit — email, social, or your company SSO. This is your billing identity, recoverable by email.'
  },
  {
    n: 2,
    title: 'Pick a plan',
    body: 'Choose a tier and check out securely with Stripe. We provision a hub that is yours alone — no shared tenancy.'
  },
  {
    n: 3,
    title: 'Connect your app',
    body: 'Open xNet on web, desktop, or mobile, create your passkey, and approve a short code to claim your hub. Your data identity stays on your device.'
  },
  {
    n: 4,
    title: 'Own it',
    body: 'Invite people, manage billing, export everything, or delete your data — from one dashboard. Cancel any time; self-host with the same data whenever you like.'
  }
]

export interface CloudFaq {
  q: string
  a: string
}

export const FAQS: CloudFaq[] = [
  {
    q: 'Can I self-host instead?',
    a: 'Yes — xNet is local-first and the hub is open source. xNet Cloud just runs the hub for you. You can move between self-hosted and managed without losing data; the app never depends on the control plane.'
  },
  {
    q: 'Who can read my data?',
    a: 'Your data identity is a passkey-backed key that lives on your devices, separate from your billing account, and your private keys never reach us. Content at rest is stored as encrypted blobs keyed to you — which is why "delete my data" is irreversible even for us. The exceptions are features you turn on: server-side search and managed AI process your content in readable form to do their job. Our privacy policy is specific about exactly what we can and can\'t see.'
  },
  {
    q: 'How good are the backups, really?',
    a: 'Your hub\'s database is replicated continuously to object storage — changes ship within seconds, not on a nightly snapshot. It is asynchronous replication, so a machine that dies abruptly can lose roughly the last second of writes that had not shipped yet; we would rather say that plainly than imply a guarantee we do not have. It matters less than it sounds, because xNet is local-first: the authoritative copy is on your own device and re-syncs on reconnect. We also run an automated nightly drill that restores a real hub from its replica and checks it comes up — because "we replicate" and "we can restore you" are not the same claim.'
  },
  {
    q: 'What happens if a payment fails?',
    a: 'Nothing sudden, and nothing silent. Your card gets retried for two weeks while your hub keeps working normally. If it still has not gone through, the hub goes read-only — everything stays readable and exportable, it just stops taking new writes — and we email you. Longer still and the hub is paused with your encrypted data kept in cold storage for a month, then a final dated notice before the cloud copy is deleted. Paying at any point in that sequence puts everything back immediately. The copy on your own devices is never touched by any of it.'
  },
  {
    q: 'What happens if I cancel?',
    a: 'Your subscription cancels at the end of the period and the hub is suspended, with your encrypted backup retained for a grace window so you can re-subscribe or export. Deleting your data is a separate, explicit, irreversible action.'
  },
  {
    q: 'Where does the margin come from?',
    a: 'From operations and support — running your hub, backups, isolation, SLAs, and admin — never from access to your own data. Export everything for free, pay no egress fees, and self-host the same open-source hub whenever you like. Our Charter calls this the "no ground rent" rule and links every one of those promises to the code that backs it.'
  },
  {
    q: 'What happens if you miss the uptime you promised?',
    a: "On the plans that publish a number, you get money back. We measure availability over a rolling 30 days on our own status page, and if we come in under 99.9% we credit 10% of that month's fee — 25% below 99%, 50% below 95%. You don't have to catch it for it to count, but do tell us if you think we owe you and we'll check the same numbers you can see. Plans that say 'best-effort' don't carry a number, and we'd rather say that plainly than print one we haven't committed to."
  },
  {
    q: 'How do seats work?',
    a: "A seat is someone we run capacity for — a collaborator whose devices sync against your hub. You invite them from your dashboard: they open xNet, create their own passkey, and read you a short code. Their keys never touch us. Guests you invite for read access don't use a seat, and the Community plan doesn't count people at all — it's a flat price no matter how big your community gets. We won't charge you for the size of an audience you brought."
  },
  {
    q: 'Do I pay for AI usage?',
    a: 'The managed AI gateway is included on paid plans up to a budget; usage beyond that is metered transparently and shown on your dashboard. A hard budget stop prevents surprise bills.'
  }
]
