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
  id: 'demo' | 'personal' | 'family' | 'team' | 'enterprise'
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

export const updated = 'June 2026'

/**
 * Public-facing tiers, cheapest → richest. The full catalog also has `community`
 * and `company` tiers (variants of team/enterprise isolation); they're available
 * on request but kept off the public grid to keep the decision simple.
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
      '5 seats, one bill',
      'Shared spaces & folders',
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
      '99.9% best-effort availability'
    ],
    cta: { label: 'Get Team', href: startUrl('team') }
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
      'SSO / SCIM via WorkOS',
      'Data residency (region pinning)',
      'Custom SLA & support',
      'Audit logging & admin controls'
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
    body: 'Manage billing, add seats, export everything, or delete your data — from one dashboard. Cancel any time; self-host with the same data whenever you like.'
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
    q: 'What happens if I cancel?',
    a: 'Your subscription cancels at the end of the period and the hub is suspended, with your encrypted backup retained for a grace window so you can re-subscribe or export. Deleting your data is a separate, explicit, irreversible action.'
  },
  {
    q: 'Where does the margin come from?',
    a: 'From operations and support — running your hub, backups, isolation, SLAs, and admin — never from access to your own data. Export everything for free, pay no egress fees, and self-host the same open-source hub whenever you like. Our Charter calls this the "no ground rent" rule and links every one of those promises to the code that backs it.'
  },
  {
    q: 'Do I pay for AI usage?',
    a: 'The managed AI gateway is included on paid plans up to a budget; usage beyond that is metered transparently and shown on your dashboard. A hard budget stop prevents surprise bills.'
  }
]
