/**
 * Sourced claims for the "/why" ("The Followed") landing page.
 *
 * Mirrors the citation discipline of compare.ts: every claim carries a
 * human-readable `source` and an https `sourceUrl`, enforced at build time by
 * scripts/validate-surveillance.ts (wired into `pnpm build`). When a popular
 * narrative oversimplifies a fact, the correction lives in `caveat` and is
 * rendered as fine print — accuracy is the whole credibility of this page.
 *
 * Figures verified 2024–2026. Bump `updated` and re-check sources when refreshed.
 */

export type Tone = 'alarm' | 'hope'

export interface Claim {
  id: string
  /** Time-of-day label that turns Act I into "an ordinary afternoon". */
  moment: string
  /** The physical-world re-enactment beat (Act I voice). */
  physical: string
  /** The real online mechanism it maps to (Act II voice). */
  digital: string
  /** Headline stat, kept short and quotable. */
  stat: string
  source: string
  sourceUrl: string
  /** Accuracy hedge rendered as fine print; omit when there is nothing to qualify. */
  caveat?: string
  tone: Tone
}

export const updated = 'June 2026'

/** The Consumer Reports / Markup figure the whole page hinges on. */
export const COMPANIES_PER_USER = 2230

export const CLAIMS: Claim[] = [
  {
    id: 'reported-to-thousands',
    moment: '8:02 AM',
    physical:
      'You step into the corner shop. A greeter clips a numbered tag to your collar — "just for analytics" — and notes that you came from the bakery next door.',
    digital:
      'Embedded pixels and SDKs report your visit to companies you have never heard of, often before you click anything — and whether or not you have an account with them.',
    stat: 'The average person’s data reached Meta from 2,230 separate companies over three years.',
    source: 'Consumer Reports / The Markup, 2024',
    sourceUrl:
      'https://themarkup.org/privacy/2024/01/17/each-facebook-user-is-monitored-by-thousands-of-companies-study-indicates',
    caveat:
      'The study’s panel self-selected for privacy-aware users, so treat 2,230 as directional, not a population mean.',
    tone: 'alarm'
  },
  {
    id: 'shadow-profile',
    moment: '8:31 AM',
    physical:
      'You never signed up for a loyalty card. It doesn’t matter — the tag follows you anyway, building a file under a number instead of your name.',
    digital:
      'Trackers profile logged-out visitors and people with no account at all. Researchers found embedded pixels sending sensitive health details to Meta for patients who had never used Facebook.',
    stat: 'As of 2024, roughly a third of healthcare websites still carried the Meta Pixel.',
    source: 'The Markup “Pixel Hunt”; HIPAA Journal, 2024',
    sourceUrl:
      'https://www.hipaajournal.com/one-third-healthcare-websites-meta-pixel-tracking-code-2024/',
    tone: 'alarm'
  },
  {
    id: 'fingerprint',
    moment: '11:47 AM',
    physical:
      'You peel off the clip-on tag. Too late: they’ve already stitched one into the lining of your coat from the cut of your shoes and the way you walk. You can’t take it off.',
    digital:
      'Fingerprinting identifies you from screen size, fonts, GPU, language and dozens of other signals — no cookie to clear, nothing to opt out of.',
    stat: 'Combining browser and device signals can single out ~99% of users with no cookie at all.',
    source: 'EFF Cover Your Tracks; 2024 web crawls',
    sourceUrl: 'https://coveryourtracks.eff.org/',
    tone: 'alarm'
  },
  {
    id: 'loyalty-sensor',
    moment: '2:15 PM',
    physical:
      'The discount card in your wallet turns out to be a logger for every basket. The store knows what you reached for and put back.',
    digital:
      'Retailers turned purchase histories into advertising businesses. Target once modeled pregnancy and due dates from about 25 ordinary products, then hid the baby coupons among unrelated items.',
    stat: 'Retail media generated roughly $140B in ad revenue globally in 2024.',
    source: 'eMarketer; Duhigg, NYT 2012',
    sourceUrl: 'https://www.nytimes.com/2012/02/19/magazine/shopping-habits.html',
    caveat:
      'Target’s pregnancy model is documented; the famous “angry father at the store” anecdote was reported second-hand and has never been verified — treat it as folklore.',
    tone: 'alarm'
  },
  {
    id: 'online-offline',
    moment: '6:40 PM',
    physical:
      'On the walk home, the mall quietly matches the poster you glanced at this morning to the card you swiped tonight.',
    digital:
      'Google secretly paid Mastercard for transaction data to confirm whether people who saw an ad later bought something in a physical store.',
    stat: 'The deal covered roughly 2 billion cards and was never disclosed to cardholders.',
    source: 'Bloomberg, 2018',
    sourceUrl:
      'https://www.bloomberg.com/news/articles/2018-08-30/google-and-mastercard-cut-a-secret-ad-deal-to-track-retail-sales',
    caveat: 'Only the merchant and total were shared, not the itemized basket.',
    tone: 'alarm'
  },
  {
    id: 'brokers',
    moment: '9:58 PM',
    physical:
      'Every chain you visited pools its tags into one ledger about you, sold on to anyone who asks — including strangers three states away.',
    digital:
      'Data brokers fuse loyalty, web, location and public records into a single profile, then license it across the ad ecosystem.',
    stat: 'Acxiom claims up to ~10,000 attributes on roughly 2.5 billion people.',
    source: 'Acxiom marketing; FTC 2014 baseline report',
    sourceUrl:
      'https://www.ftc.gov/reports/data-brokers-call-transparency-accountability-report-federal-trade-commission-may-2014',
    caveat:
      'The 10,000-attribute figure is Acxiom’s own marketing claim, not independently audited.',
    tone: 'alarm'
  },
  {
    id: 'oracle-dead',
    moment: 'The next morning',
    physical:
      'One of the biggest tag-buyers in the mall simply goes out of business. The model isn’t invincible.',
    digital:
      'Oracle shut down its entire advertising and consumer-data business — once targeting across 30,000+ attributes — as revenue collapsed under privacy pressure.',
    stat: 'Oracle Advertising closed on September 30, 2024 (revenue fell from ~$2B to ~$300M).',
    source: 'Adweek; Oracle end-of-life FAQ, 2024',
    sourceUrl: 'https://www.adweek.com/programmatic/oracle-is-shutting-down-its-ad-business/',
    tone: 'hope'
  },
  {
    id: 'ftc-bans',
    moment: 'And then',
    physical:
      'A regulator bans the worst of it: no more selling the record of who visited the clinic, the church, the shelter.',
    digital:
      'In 2024 the FTC issued its first-ever bans on selling sensitive location data, ordering brokers to delete the histories they had amassed.',
    stat: 'X-Mode/Outlogic, InMarket and Kochava were all forced to stop selling precise location data in 2024.',
    source: 'FTC enforcement actions, 2024',
    sourceUrl:
      'https://www.ftc.gov/news-events/news/press-releases/2024/01/ftc-order-prohibits-data-broker-x-mode-social-outlogic-selling-sensitive-location-data',
    tone: 'hope'
  }
]

export const alarmClaims = CLAIMS.filter((c) => c.tone === 'alarm')
