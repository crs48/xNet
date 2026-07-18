import { a as createComponent, m as maybeRenderHead, f as renderComponent, d as renderTemplate, c as createAstro, b as addAttribute, e as renderScript } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$Badge } from '../chunks/Badge_Cy_MVeE-.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
export { renderers } from '../renderers.mjs';

const $$FollowedHero = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden"> <!-- Grid background --> <div class="absolute inset-0 bg-[linear-gradient(rgba(220,38,38,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(220,38,38,0.04)_1px,transparent_1px)] bg-[size:64px_64px]"></div> <!-- Radial glow (amber → red, the surveillance act) --> <div class="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-amber-500/[0.07] blur-[120px]"></div> <div class="relative mx-auto max-w-4xl px-6 py-32 lg:py-40"> <div class="text-center"> <div class="flex justify-center mb-8"> ${renderComponent($$result, "Badge", $$Badge, { "variant": "warning" }, { "default": ($$result2) => renderTemplate` <span class="relative flex h-2 w-2"> <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span> <span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span> </span>
A thought experiment about being followed
` })} </div> <h1 class="text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl"> <span class="bg-gradient-to-br from-gray-900 via-gray-700 to-amber-600 dark:from-white dark:via-gray-100 dark:to-amber-400 bg-clip-text text-transparent">
You’d never allow this<br>in the real world.
</span> </h1> <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400 sm:text-xl">
Picture the tracking you accept online — happening to you physically, all
        day, by people you can see. It would feel like a dystopia. Online, we call
        it Tuesday.
</p> <p class="mx-auto mt-8 max-w-xl text-sm text-gray-400 dark:text-gray-500">
Walk through an ordinary afternoon ↓
</p> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/FollowedHero.astro", void 0);

const $$Astro$1 = createAstro("https://xnet.fyi");
const $$PhysicalAct = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$PhysicalAct;
  const { claims } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section class="relative border-t border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6"> <!-- Sticky tracker counter — the visceral device --> <div class="sticky top-20 z-10 mb-12 flex justify-center"> <div class="inline-flex items-center gap-3 rounded-full border border-amber-500/30 bg-white/80 px-5 py-2 font-mono text-sm shadow-sm backdrop-blur dark:bg-[#0a0a0f]/80"> <span class="relative flex h-2.5 w-2.5"> <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60"></span> <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span> </span> <span class="text-gray-500 dark:text-gray-400">Trackers on you:</span> <span id="tracker-count" class="font-bold tabular-nums text-red-500"${addAttribute(claims.length, "data-total")}>0</span> </div> </div> <ol class="space-y-6"> ${claims.map((claim, i) => renderTemplate`<li class="animate-on-scroll" data-beat> <div class="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-6"> <div class="mb-3 flex items-center gap-3"> <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 font-mono text-xs font-bold text-amber-500"> ${i + 1} </span> <span class="font-mono text-xs uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80"> ${claim.moment} </span> </div> <p class="text-lg leading-relaxed text-gray-700 dark:text-gray-200">${claim.physical}</p> </div> </li>`)} </ol> <p class="mt-12 text-center text-sm text-gray-400 dark:text-gray-500">
By the end of the day you’re carrying a small forest of tags — and none of
      them are yours.
</p> </div> </section> ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/components/followed/PhysicalAct.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/PhysicalAct.astro", void 0);

const updated = "June 2026";
const COMPANIES_PER_USER = 2230;
const CLAIMS = [
  {
    id: "reported-to-thousands",
    moment: "8:02 AM",
    physical: 'You step into the corner shop. A greeter clips a numbered tag to your collar — "just for analytics" — and notes that you came from the bakery next door.',
    digital: "Embedded pixels and SDKs report your visit to companies you have never heard of, often before you click anything — and whether or not you have an account with them.",
    stat: "The average person’s data reached Meta from 2,230 separate companies over three years.",
    source: "Consumer Reports / The Markup, 2024",
    sourceUrl: "https://themarkup.org/privacy/2024/01/17/each-facebook-user-is-monitored-by-thousands-of-companies-study-indicates",
    caveat: "The study’s panel self-selected for privacy-aware users, so treat 2,230 as directional, not a population mean.",
    tone: "alarm"
  },
  {
    id: "shadow-profile",
    moment: "8:31 AM",
    physical: "You never signed up for a loyalty card. It doesn’t matter — the tag follows you anyway, building a file under a number instead of your name.",
    digital: "Trackers profile logged-out visitors and people with no account at all. Researchers found embedded pixels sending sensitive health details to Meta for patients who had never used Facebook.",
    stat: "As of 2024, roughly a third of healthcare websites still carried the Meta Pixel.",
    source: "The Markup “Pixel Hunt”; HIPAA Journal, 2024",
    sourceUrl: "https://www.hipaajournal.com/one-third-healthcare-websites-meta-pixel-tracking-code-2024/",
    tone: "alarm"
  },
  {
    id: "fingerprint",
    moment: "11:47 AM",
    physical: "You peel off the clip-on tag. Too late: they’ve already stitched one into the lining of your coat from the cut of your shoes and the way you walk. You can’t take it off.",
    digital: "Fingerprinting identifies you from screen size, fonts, GPU, language and dozens of other signals — no cookie to clear, nothing to opt out of.",
    stat: "Combining browser and device signals can single out ~99% of users with no cookie at all.",
    source: "EFF Cover Your Tracks; 2024 web crawls",
    sourceUrl: "https://coveryourtracks.eff.org/",
    tone: "alarm"
  },
  {
    id: "loyalty-sensor",
    moment: "2:15 PM",
    physical: "The discount card in your wallet turns out to be a logger for every basket. The store knows what you reached for and put back.",
    digital: "Retailers turned purchase histories into advertising businesses. Target once modeled pregnancy and due dates from about 25 ordinary products, then hid the baby coupons among unrelated items.",
    stat: "Retail media generated roughly $140B in ad revenue globally in 2024.",
    source: "eMarketer; Duhigg, NYT 2012",
    sourceUrl: "https://www.nytimes.com/2012/02/19/magazine/shopping-habits.html",
    caveat: "Target’s pregnancy model is documented; the famous “angry father at the store” anecdote was reported second-hand and has never been verified — treat it as folklore.",
    tone: "alarm"
  },
  {
    id: "online-offline",
    moment: "6:40 PM",
    physical: "On the walk home, the mall quietly matches the poster you glanced at this morning to the card you swiped tonight.",
    digital: "Google secretly paid Mastercard for transaction data to confirm whether people who saw an ad later bought something in a physical store.",
    stat: "The deal covered roughly 2 billion cards and was never disclosed to cardholders.",
    source: "Bloomberg, 2018",
    sourceUrl: "https://www.bloomberg.com/news/articles/2018-08-30/google-and-mastercard-cut-a-secret-ad-deal-to-track-retail-sales",
    caveat: "Only the merchant and total were shared, not the itemized basket.",
    tone: "alarm"
  },
  {
    id: "brokers",
    moment: "9:58 PM",
    physical: "Every chain you visited pools its tags into one ledger about you, sold on to anyone who asks — including strangers three states away.",
    digital: "Data brokers fuse loyalty, web, location and public records into a single profile, then license it across the ad ecosystem.",
    stat: "Acxiom claims up to ~10,000 attributes on roughly 2.5 billion people.",
    source: "Acxiom marketing; FTC 2014 baseline report",
    sourceUrl: "https://www.ftc.gov/reports/data-brokers-call-transparency-accountability-report-federal-trade-commission-may-2014",
    caveat: "The 10,000-attribute figure is Acxiom’s own marketing claim, not independently audited.",
    tone: "alarm"
  },
  {
    id: "oracle-dead",
    moment: "The next morning",
    physical: "One of the biggest tag-buyers in the mall simply goes out of business. The model isn’t invincible.",
    digital: "Oracle shut down its entire advertising and consumer-data business — once targeting across 30,000+ attributes — as revenue collapsed under privacy pressure.",
    stat: "Oracle Advertising closed on September 30, 2024 (revenue fell from ~$2B to ~$300M).",
    source: "Adweek; Oracle end-of-life FAQ, 2024",
    sourceUrl: "https://www.adweek.com/programmatic/oracle-is-shutting-down-its-ad-business/",
    tone: "hope"
  },
  {
    id: "ftc-bans",
    moment: "And then",
    physical: "A regulator bans the worst of it: no more selling the record of who visited the clinic, the church, the shelter.",
    digital: "In 2024 the FTC issued its first-ever bans on selling sensitive location data, ordering brokers to delete the histories they had amassed.",
    stat: "X-Mode/Outlogic, InMarket and Kochava were all forced to stop selling precise location data in 2024.",
    source: "FTC enforcement actions, 2024",
    sourceUrl: "https://www.ftc.gov/news-events/news/press-releases/2024/01/ftc-order-prohibits-data-broker-x-mode-social-outlogic-selling-sensitive-location-data",
    tone: "hope"
  }
];
const alarmClaims = CLAIMS.filter((c) => c.tone === "alarm");

const $$RevealHinge = createComponent(($$result, $$props, $$slots) => {
  const formatted = COMPANIES_PER_USER.toLocaleString("en-US");
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-y border-border/50 bg-surface/20 dark:bg-surface/30"> <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full bg-red-500/[0.06] blur-[120px]"></div> <div class="relative mx-auto max-w-3xl px-6 py-28 text-center lg:py-36"> <p class="font-mono text-xs uppercase tracking-[0.2em] text-red-500/80">The reveal</p> <h2 class="mt-6 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl"> <span class="bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
You’d call that dystopian.<br>You did it today — online —<br>about
<span class="text-red-500">${formatted}</span> times.
</span> </h2> <p class="mx-auto mt-8 max-w-xl text-lg text-gray-500 dark:text-gray-400">
None of it felt like anything, because software is invisible and costs
      almost nothing to deploy everywhere at once. Here is the same afternoon,
      with the set removed.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/RevealHinge.astro", void 0);

const $$Astro = createAstro("https://xnet.fyi");
const $$MechanismGrid = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$MechanismGrid;
  const { claims } = Astro2.props;
  const toneMap = {
    alarm: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/[0.03]",
      accent: "text-amber-600 dark:text-amber-400",
      chipBg: "bg-amber-500/10",
      label: "How it really works"
    },
    hope: {
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/[0.03]",
      accent: "text-emerald-600 dark:text-emerald-400",
      chipBg: "bg-emerald-500/10",
      label: "It\u2019s not invincible"
    }
  };
  return renderTemplate`${maybeRenderHead()}<section class="py-20 lg:py-28"> <div class="mx-auto max-w-4xl px-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "This is the internet, right now", "subtitle": "Each moment from the story is a real mechanism. Every number below is cited \u2014 accuracy is the whole point.", "align": "center" })} <div class="mt-12 space-y-5"> ${claims.map((claim) => {
    const t = toneMap[claim.tone];
    return renderTemplate`<article${addAttribute(`animate-on-scroll rounded-xl border ${t.border} ${t.bg} p-6`, "class")}> <div class="mb-3 flex flex-wrap items-center gap-3"> <span${addAttribute(`rounded-md ${t.chipBg} px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${t.accent}`, "class")}> ${t.label} </span> <span class="font-mono text-xs text-gray-400 dark:text-gray-500">${claim.moment}</span> </div> <p class="text-base leading-relaxed text-gray-700 dark:text-gray-200">${claim.digital}</p> <p${addAttribute(`mt-4 text-lg font-semibold ${t.accent}`, "class")}>${claim.stat}</p> <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400"> <span>Source:</span> <a${addAttribute(claim.sourceUrl, "href")} target="_blank" rel="noopener noreferrer"${addAttribute(`underline decoration-dotted underline-offset-2 hover:${t.accent}`, "class")}> ${claim.source} </a> </div> ${claim.caveat && renderTemplate`<p class="mt-3 border-l-2 border-gray-300 pl-3 text-xs italic leading-relaxed text-gray-400 dark:border-gray-700 dark:text-gray-500"> ${claim.caveat} </p>`} </article>`;
  })} </div> <p class="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
Figures verified ${updated}. The whole list lives in one cited data file —
<a href="https://github.com/crs48/xNet/blob/main/site/src/data/surveillance.ts" target="_blank" rel="noopener noreferrer" class="underline decoration-dotted underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300">check our sources</a>.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/MechanismGrid.astro", void 0);

const $$TheTurn = createComponent(($$result, $$props, $$slots) => {
  const points = [
    {
      title: "Your data lives on your device",
      body: "Documents, databases, the whole workspace persist locally first \u2014 SQLite in the browser, native on desktop and mobile. No server is required for any of it."
    },
    {
      title: "You hold the keys",
      body: "Your identity is a cryptographic key on your device (a did:key, backed by a passkey) \u2014 not an account on someone\u2019s server. Nobody else holds your credentials."
    },
    {
      title: "Every change is signed by you",
      body: "Edits are signed with your key and hash-chained, so authorship and integrity are provable. The data is yours by construction, not by promise."
    },
    {
      title: "No pixel. No broker. No ads.",
      body: "xNet isn\u2019t funded by advertising, so there is no tracking SDK to embed and no profile to sell. The business model simply doesn\u2019t need your behavior."
    },
    {
      title: "Tracking is off by default",
      body: "There\u2019s one consent switch for anything that could leave your device, and it starts off. Optional diagnostics are scrubbed and opt-in \u2014 never the price of entry."
    },
    {
      title: "Open, and verifiable",
      body: "The SDK and protocol are MIT-licensed, with a written spec and golden test vectors reproduced in Rust, Python and Swift. You don\u2019t have to trust us \u2014 you can check."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-t border-border/50 bg-surface/10 dark:bg-surface/20 py-24 lg:py-32"> <div class="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-emerald-500/[0.06] blur-[120px]"></div> <div class="relative mx-auto max-w-5xl px-6"> <div class="text-center"> <p class="font-mono text-xs uppercase tracking-[0.2em] text-emerald-500/80">The turn</p> <div class="mt-6"> ${renderComponent($$result, "SectionHeader", $$SectionHeader, { "title": "It doesn\u2019t have to be built this way", "subtitle": "xNet is a local-first workspace where the data starts on your device and stays under your control. Not a tracker blocker \u2014 a different foundation, where there\u2019s nothing to traffic in the first place.", "align": "center" })} </div> </div> <div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"> ${points.map((point) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6"> <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"> <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg> </div> <h3 class="mb-2 text-base font-semibold text-gray-800 dark:text-white">${point.title}</h3> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${point.body}</p> </div>`)} </div> <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"> <a href="/app" class="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500">
Use the app — free, offline, private
</a> <a href="/compare" class="rounded-lg border border-border px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-emerald-500/50 hover:bg-surface dark:text-gray-300">
See how it compares
</a> <a href="/build-with" class="rounded-lg border border-border px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-emerald-500/50 hover:bg-surface dark:text-gray-300">
Build it in any language
</a> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/TheTurn.astro", void 0);

const $$HonestyBox = createComponent(($$result, $$props, $$slots) => {
  const rows = [
    {
      isnt: "We won\u2019t say everything is end-to-end encrypted.",
      is: "Encryption is yours to switch on. Some data is public by design \u2014 you decide what\u2019s private."
    },
    {
      isnt: "We won\u2019t say there are no servers.",
      is: "No server is required, but a hub \u2014 yours to self-host or our managed one \u2014 is useful for sync and backup. When you use one, it only ever holds encrypted data."
    },
    {
      isnt: "We won\u2019t say you\u2019re anonymous.",
      is: "Your identity is a pseudonymous key you control, not a name we hold. If you opt into diagnostics, they\u2019re scrubbed first."
    }
  ];
  return renderTemplate`${maybeRenderHead()}<section class="py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6"> <div class="rounded-2xl border border-border bg-surface/30 p-8 dark:bg-surface/40 lg:p-10"> <h2 class="text-2xl font-bold tracking-tight text-gray-800 dark:text-white">What xNet is — and isn’t</h2> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
A privacy pitch that overclaims is just more marketing. So here’s the honest
        version, and the source code to check it against.
</p> <ul class="mt-8 space-y-5"> ${rows.map((row) => renderTemplate`<li class="grid gap-3 sm:grid-cols-[1fr_1fr] sm:gap-5"> <div class="flex gap-2.5"> <span class="select-none text-gray-400 dark:text-gray-600">✕</span> <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">${row.isnt}</p> </div> <div class="flex gap-2.5"> <span class="select-none text-emerald-500">✓</span> <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">${row.is}</p> </div> </li>`)} </ul> <div class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm"> <a href="/privacy" class="text-emerald-600 underline decoration-dotted underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">Read the privacy policy</a> <a href="https://github.com/crs48/xNet" target="_blank" rel="noopener noreferrer" class="text-emerald-600 underline decoration-dotted underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">Go check the source</a> </div> </div> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/HonestyBox.astro", void 0);

const $$SelfAudit = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<section class="relative overflow-hidden border-t border-border/50 py-24 lg:py-32"> <div class="absolute left-1/2 bottom-0 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-emerald-500/[0.05] blur-[120px]"></div> <div class="relative mx-auto max-w-3xl px-6 text-center"> <div id="self-audit" class="mx-auto inline-flex max-w-full flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] px-6 py-5 font-mono text-sm"> <p class="text-emerald-600 dark:text-emerald-400">
This page set <b id="audit-cookies">0 cookies</b> ·
<b id="audit-third-party">0 third-party requests</b> · 0 trackers.
</p> <p class="text-xs text-gray-500 dark:text-gray-400">
Verify it yourself: open DevTools → Network. Nothing about your visit left
        your browser.
</p> </div> <h2 class="mt-12 text-3xl font-bold tracking-tight text-gray-800 dark:text-white sm:text-4xl">
Own your data instead of leaking it
</h2> <p class="mx-auto mt-4 max-w-xl text-gray-500 dark:text-gray-400">
Documents, databases, canvas, tasks — a real workspace that happens to keep
      everything on your side of the glass.
</p> <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"> <a href="/app" class="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500">
Use the app
</a> <div class="group relative inline-flex items-center gap-3 rounded-lg border border-border bg-surface/30 px-5 py-2.5 font-mono text-sm text-gray-500 dark:bg-surface/50 dark:text-gray-400"> <span class="text-emerald-500">$</span> <span>pnpm add @xnetjs/react @xnetjs/data</span> <button class="copy-btn rounded border border-border px-1.5 py-0.5 text-xs text-gray-600 transition-colors hover:text-gray-900 dark:hover:text-gray-300" data-copy="pnpm add @xnetjs/react @xnetjs/data" aria-label="Copy install command">
Copy
</button> </div> </div> </div> </section> ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/components/followed/SelfAudit.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/components/followed/SelfAudit.astro", void 0);

const $$Why = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Why xNet \u2014 you\u2019d never allow this in the real world", "description": "The tracking we accept online would feel dystopian if it were physical. Here is exactly how it works, every claim cited \u2014 and how xNet is built so there\u2019s nothing to traffic." }, { "default": ($$result2) => renderTemplate`  ${maybeRenderHead()}<noscript> <style>
      .animate-on-scroll {
        opacity: 1 !important;
        transform: none !important;
      }
    </style> </noscript> ${renderComponent($$result2, "Nav", $$Nav, {})} <main> ${renderComponent($$result2, "FollowedHero", $$FollowedHero, {})} ${renderComponent($$result2, "PhysicalAct", $$PhysicalAct, { "claims": alarmClaims })} ${renderComponent($$result2, "RevealHinge", $$RevealHinge, {})} ${renderComponent($$result2, "MechanismGrid", $$MechanismGrid, { "claims": CLAIMS })} ${renderComponent($$result2, "TheTurn", $$TheTurn, {})} ${renderComponent($$result2, "HonestyBox", $$HonestyBox, {})} ${renderComponent($$result2, "SelfAudit", $$SelfAudit, {})} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/why.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/why.astro";
const $$url = "/why";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Why,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
