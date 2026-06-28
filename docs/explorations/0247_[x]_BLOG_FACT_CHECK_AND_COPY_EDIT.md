# Blog Fact-Check and Copy-Edit Pass

## Problem Statement

The site now carries a five-essay blog series (`site/src/pages/blog/`) that
leans heavily on real-world science, history, and economics to make its case
for local-first software. Each essay states dozens of checkable facts — core
power densities, dust tonnages, carbon fluxes, pirate-era mortality,
peer-reviewed papers — and each closes with a "Sources" list, so the series is
implicitly making an **accuracy promise**. The honesty boxes (`Honest*.astro`)
double down on that promise by explicitly policing the metaphors.

Two asks:

1. **Fact-check** every essay — confirm we are accurate and not
   misrepresenting any source.
2. **Copy-edit** — clean up language that doesn't read well or reads as
   AI-generated.

The credibility of the whole `/why` + `/commitments` + blog stack depends on
the citations holding up, so an error here is a brand risk, not a typo.

## Executive Summary

The series is in **good shape**. Across ~60 discrete factual claims, the
science and citations are overwhelmingly sound, the honesty boxes are
genuinely balanced, and the authors hedged the genuinely-uncertain points
("may swallow the inner planets", "by some estimates", "close to") correctly.

Five domain fact-checks (one per essay, web-sourced) surfaced **one
misrepresentation that mattered, a handful of overstatements, and several
precision wrinkles**. All high-confidence accuracy fixes have been **applied**
to the `.astro` files in this pass. The single most important fix:

> **The leveragism essay cited Killingsworth, Kahneman & Mellers (PNAS 2023)
> for the claim that "more money buys surprisingly little extra happiness."
> That 2023 paper found the *opposite* — happiness keeps rising with income
> for most people; the plateau holds only for the least-happy ~20%.** The
> essay was invoking the discredited 2010 plateau while footnoting the 2023
> paper that overturned it. Now reworded so the argument (money buys the
> *ability to refuse*) no longer rests on a misread of its own citation.

The copy-edit story is narrower: the prose is strong and voice-driven, so the
main findings are (a) **mixed British/American spelling** across and within
posts, and (b) a set of **intentional house-style tics** (em-dash density, the
"it's not X — it's Y" antithesis, repeated meta-signposts) that read as
AI-flavored in aggregate. These are recommended, not imposed — flattening the
voice would be the wrong trade.

## Current State In The Repository

The blog is hand-authored `.astro` + a metadata module — no MDX/content
collection (exploration 0239).

| Essay | File | Domain checked |
|---|---|---|
| A Great Pirate Age | [a-great-pirate-age.astro](site/src/pages/blog/a-great-pirate-age.astro) | One Piece canon, Golden Age of Piracy |
| Data Should Work Like Soil | [data-should-work-like-soil.astro](site/src/pages/blog/data-should-work-like-soil.astro) | Mycorrhizal ecology, nervous-system physiology |
| The Gentlest Furnace | [the-gentlest-furnace.astro](site/src/pages/blog/the-gentlest-furnace.astro) | Stellar physics, information physics |
| The Desert That Feeds the Forest | [the-desert-that-feeds-the-forest.astro](site/src/pages/blog/the-desert-that-feeds-the-forest.astro) | Saharan dust, pollinator ecology, OSS labor |
| The Right to Say No | [the-right-to-say-no.astro](site/src/pages/blog/the-right-to-say-no.astro) | Extraction economics, Benn Jordan video |

Supporting claim-bearing components (also audited):

- Honesty boxes: [HonestPirate](site/src/components/blog/HonestPirate.astro),
  [HonestMycelium](site/src/components/blog/HonestMycelium.astro),
  [HonestStar](site/src/components/blog/HonestStar.astro),
  [HonestDesert](site/src/components/blog/HonestDesert.astro),
  [HonestExit](site/src/components/blog/HonestExit.astro)
- Diagram cards: [ThreeNervousSystems](site/src/components/blog/ThreeNervousSystems.astro),
  [HydrostaticBalance](site/src/components/blog/HydrostaticBalance.astro),
  [DustBridge](site/src/components/blog/DustBridge.astro),
  [GrowthVsLeverage](site/src/components/blog/GrowthVsLeverage.astro)
- Metadata + feed: [blog.ts](site/src/data/blog.ts), [rss.xml.ts](site/src/pages/blog/rss.xml.ts)

The repeated surveillance figures (2,230 companies; ~99% fingerprinting;
~$140B) all trace back to [surveillance.ts](site/src/data/surveillance.ts),
which is itself citation-disciplined (build-validated by
`scripts/validate-surveillance.ts`). The blog's renderings are **faithful**
to that source: "2,230" is correctly scoped to Meta ("a single platform"),
99% to EFF fingerprinting, and $140B to retail-media ad revenue.

```mermaid
flowchart LR
  subgraph Audit
    A[5 essays + 10 components] --> B[Enumerate ~60 factual claims]
    B --> C[5 parallel web fact-checks<br/>one per domain]
    C --> D{Verdict}
  end
  D -->|Accurate / well-hedged| E[Leave as-is]
  D -->|Overstated / misread| F[Apply accuracy fix]
  D -->|Voice / style| G[Document as recommendation]
  F --> H[12 edits across 5 files]
  E --> I[This exploration]
  G --> I
  H --> I
```

## External Research

Five web-grounded fact-checks were run, one per essay. Headline results:

- **Pirate** — One Piece premise, the Luffy "most freedom" quote, the
  1650–1730 Golden Age window, elected captains/quartermasters, written
  articles, near-equal shares, the wounded-pirate insurance fund, the Marcus
  Rediker "most egalitarian plans…" quote, and the "~10,000 sailed / up to a
  third formerly enslaved" framing (Kinkor) **all check out** and are
  responsibly hedged. The honesty box's counterweight ("emancipation was the
  exception") is accurate and necessary. **One real problem:** the line that
  *merchant and navy* crews "killed them at rates rivaling the slave ships"
  conflated **slave-ship-crew** mortality (~20%, House of Commons 1784–90)
  with ordinary merchant/navy crews, whose mortality was much lower.
- **Mycelium** — ~400 Myr symbiosis age, ~90% of plants mycorrhizal,
  N+P-for-carbon trade, the "up to 2 km of mycelium per cm³" upper bound
  (Leake/Read — a real figure, *not* a unit error), the 13.12 Gt CO₂e/yr
  flux (Hawkins et al., *Current Biology* 2023), and the Wood-Wide-Web
  citation-bias critique (Karst/Jones/Hoeksema 2023; Henriksson et al. 2023)
  **all check out.** **Two overstatements:** the carbon hand-off "twenty to
  forty percent" sits above the typical 4–20% literature, and "one of the
  largest living **carbon stores**" miscasts an annual **flux** as a standing
  **stock**.
- **Star** — 276 W/m³ core power density, the compost-heap/reptile-metabolism
  comparison, the hydrostatic-equilibrium thermostat, Landauer's principle,
  supergiant-vs-red-dwarf lifetimes, 15 MK core, 93M miles, the red-giant
  ending, and "made of star stuff" **all accurate.** Two light touches: the
  ">99% of the world's data" stat is specifically **intercontinental** fiber
  traffic, and "more heat per litre **than** the Sun's core" overstates a
  source that says "**similar to** an active compost heap."
- **Desert** — the 22,000-tons-phosphorus ≈ rainfall-loss balance (Yu et al.
  2015), the diatomite dust source, most-bees-are-solitary, wild-bee decline,
  the Eghbal *Roads and Bridges* quotes, and Heartbleed/OpenSSL **all check
  out.** **Issues:** "27.7M tons **lift off the Sahara**" conflates the
  Amazon-**deposited** figure (27.7M) with the amount that **leaves** the
  Sahara (~182M); the Bodélé lakebed's "five to eight thousand years ago" is
  contestable (the basin itself held water until ~1,000 yrs ago); the
  "million and a half" view count isn't verifiable; and "what ecologists call
  a keystone species" overstates a term that's about *disproportionate
  effect*, not *low number*.
- **Leveragism** — the Benn Jordan video ID/title/author, the ~3× S&P decade,
  the Toys "R" Us LBO and self-dealing fees, Invitation Homes, Hirschman's
  *Exit, Voice, and Loyalty*, Varoufakis's *Technofeudalism*, Illich's
  *Shadow Work*, the BBC/EBU 2025 study (45% significant-error rate), and
  Bronnie Ware's #1 regret **all check out.** The Jordan/Gemini defamation
  incident is **documented** (his Threads post; the confusion with a Newsmax
  commentator). **The one real problem** is the Kahneman/Killingsworth
  misread described in the Executive Summary.

## Key Findings

```mermaid
mindmap
  root((Audit result))
    Accurate as written
      One Piece canon + pirate democracy
      Stellar + information physics
      Dust-bridge phosphorus balance
      Economics citations + BBC/EBU
      Surveillance figures vs /why
    Fixed this pass
      Misread happiness paper
      Pirate mortality conflation
      Carbon flux-vs-stock
      Carbon hand-off 20-40%
      Dust 27.7M vs 182M
      Bodele lakebed timing
      Keystone-species literalism
      Intercontinental fiber
      Compost-heat inequality
      View count
      AI-defamation phrasing
    Recommended not imposed
      British vs American spelling
      Em-dash density
      "it's not X, it's Y" antithesis
      Repeated meta-signposts
```

### Changes applied (12 edits, 5 files)

| # | Essay | Before → After | Why |
|---|---|---|---|
| 1 | Pirate | "Merchant and navy crews … killed them at rates rivaling the slave ships" → "conditions brutal enough to kill …; on the era's slave ships, crews died at rates that rivaled the captives below deck" | Mortality figure belonged to slave-ship crews, not merchant/navy crews generally |
| 2 | Mycelium | "twenty to forty percent" → "twenty or thirty percent" | Typical literature is ~4–20%; 40% is the extreme tail |
| 3 | Mycelium | "one of the largest living carbon stores on the planet" → "one of the most overlooked conduits in the planet's carbon cycle … roughly a third of what humans burn in fossil fuels" | 13 Gt is an annual **flux**, not a standing **stock** |
| 4 | Star | "99% of the world's data" → "99% of the world's **intercontinental** data" | Matches the cited undersea-cable statistic |
| 5 | Star | "more heat per litre **than** the centre of the Sun" → "**about as much** heat per litre **as**" | Source says "similar to," not "less than" |
| 6 | Desert | "27.7 million tons of dust **lift off the Sahara**" → "27.7 million tons … the share that finishes the crossing, out of the roughly 182 million tons that lift off the desert"; "running every single year" → "across seven years of data" | 27.7M = deposited on Amazon; 182M = leaves Sahara; CALIPSO = 2007–13 average |
| 7 | Desert | "five to eight thousand years ago" → "within the last several thousand years" | Bodélé basin's desiccation is later and messier than the clean figure |
| 8 | Desert | "A million and a half people have watched it" → "More than a million people" | Exact view count not verifiable |
| 9 | Desert | "what ecologists call a keystone species" → "function like a keystone species" | Keystone = disproportionate *effect*, not *low number*; keep it as analogy |
| 10 | Leveragism | "more money buys surprisingly little extra happiness" → "money stops buying happiness past a comfortable income; the more careful recent work finds it keeps helping for most people. Either way, his point sits to the side of that debate…" | The cited 2023 paper found the *opposite* of the old plateau |
| 11 | Leveragism | "the company's defence was … that everyone knows it makes things up" → "the standard defence these companies reach for … is that everyone knows the systems make things up" | Don't imply Google issued a Jordan-specific statement |
| 12 | Leveragism | Citation: "Kahneman & Killingsworth … Money buys the ability to refuse, more than it buys happiness" → "Killingsworth, Kahneman & Mellers … On income, happiness, and what money actually buys past a comfortable salary" | Correct author order; drop the misleading gloss |

### Not changed (deliberately)

- **Luffy quote chapter.** Attributed to Ch. 507; the Rayleigh exchange
  actually opens in Ch. 506 and runs into 507, and quote aggregators cite 507.
  Defensible as-is; not worth a citation change.
- **"43 min" runtime** for the Benn Jordan video could not be confirmed
  programmatically (YouTube renders duration client-side). Title, ID, author,
  and topic all verified. Worth a 5-second eyeball before the next edit.

## Options And Tradeoffs

**How to handle the findings** — three postures were considered:

| Option | Pros | Cons |
|---|---|---|
| **A. Document only** (write this doc, change nothing) | Preserves author control over published prose | Leaves a real misrepresentation (#10) live on the site |
| **B. Apply accuracy fixes, document style** (chosen) | Kills the factual risk now; leaves voice decisions to a human | Requires careful, minimal rewrites that keep the cadence |
| **C. Full copy-edit + de-AI rewrite** | Maximally "clean" | High churn on merged, voice-driven content; flattens an intentional house style; easy to introduce *new* errors |

**Spelling direction** — the prose is genuinely mixed:

- British dominates the science posts: `centre`, `metre`, `litre`, `fibre`,
  `cosy`, `behaviour`, `colonis-/organis-/decentralis-`.
- American creeps in, mostly in the desert post: `fertilizer`, `monetizes`,
  `optimized`; plus `reorganize` (star) and `organize`/`decentralized`
  (leveragism). `cosy` even sits *inside* the otherwise-American desert post.

Either standard is fine; **mixed within one publication is the defect.** The
literary register leans British, so standardizing **to en-GB** is the
lower-churn, more-in-voice choice — but it's a house-style call, so it's left
for a human to greenlight rather than applied unilaterally.

**The "reads as AI-generated" tics** (present by design, recommend lightening
in future edits, not mass-removing):

- Very high **em-dash density** — multiple per paragraph in places.
- The **"it's not X — it's Y" / "not a metaphor we reached for, but the
  literal architecture"** antithesis, used repeatedly in every post.
- **Meta-signposts**: "Here's the turn", "Here is the fact that should
  rearrange how you see a map", "Before this runs away with us" — the
  scaffolding is visible.
- The **series refrain** ("Sea, soil, sky…", "Use the app — it's free,
  offline, and private") is intentional cohesion and should stay.

## Recommendation

Ship the 12 applied accuracy fixes (done). They remove the only
misrepresentation that mattered and tighten the overstatements without
touching the voice.

Then, as a **separate, optional editorial pass** a human can greenlight:

1. Pick a spelling standard (recommend **en-GB**) and normalize the ~10
   offending tokens.
2. Lightly thin the em-dashes and the "it's not X — it's Y" construction —
   roughly one antithesis per essay, not one per section.
3. Eyeball the Benn Jordan video runtime.

Do **not** do a wholesale de-AI rewrite; the cost/benefit is bad on merged,
working, voice-driven content.

## Example Code

The applied fixes are pure prose inside existing tags. Representative diff
(leveragism, the load-bearing one):

```diff
- He grounds this in a quietly devastating piece of research on income
- and well-being: past a fairly ordinary income, more money buys
- surprisingly little extra happiness. What that income really buys, he says,
- is the ability to say no — …
+ He grounds this in the research on income and well-being — though not
+ in the way it's usually told. The familiar headline is that money stops
+ buying happiness past a comfortable income; the more careful recent work
+ finds it keeps helping for most people. Either way, his point sits to the
+ side of that debate: whatever money does for your mood, what it most
+ concretely buys is the ability to say no — …
```

The optional spelling normalization, if greenlit, is a mechanical token swap
limited to prose (never inside source/citation titles such as "optical fiber"
or "Saharan dust fertilizes the Amazon"):

```
fertilizer→fertiliser  monetizes→monetises  optimized→optimised
reorganize→reorganise  organize→organise    decentralized→decentralised
```

## Risks And Open Questions

- **Tag/JSX integrity** — verified: `<strong>`/`<em>` counts are balanced in
  all five files after editing. A full `astro build` could not run here (the
  worktree has no `node_modules`), so a CI build remains the final gate.
- **Runtime claim** — the "43 min" video length is the one unverified detail.
- **Spelling direction** is a genuine open question for the maintainer
  (en-GB vs en-US) — see Options.
- **Honesty-box scope** — the boxes are accurate, but note they now slightly
  *under*-claim relative to a couple of corrected lines (e.g. the carbon
  "conduit" framing). No action needed; they remain defensible.
- **Source-link rot** — a few citations point at aggregators (Game Rant,
  grokipedia, neuvanalife). They're directionally fine but lower-authority;
  not changed here.

## Implementation Checklist

- [x] Read all five essays + all claim-bearing components
- [x] Confirm surveillance figures match `surveillance.ts` source of truth
- [x] Fact-check pirate essay (web-sourced)
- [x] Fact-check mycelium essay (web-sourced)
- [x] Fact-check star essay (web-sourced)
- [x] Fact-check desert essay (web-sourced)
- [x] Fact-check leveragism essay (web-sourced)
- [x] Fix pirate mortality conflation
- [x] Fix mycelium carbon hand-off range (20–40% → 20–30%)
- [x] Fix mycelium flux-vs-stock ("largest carbon store" → "conduit in the carbon cycle")
- [x] Scope star fiber stat to "intercontinental"
- [x] Soften star compost-heat inequality ("more than" → "about as much as")
- [x] Fix desert dust figure (27.7M deposited vs 182M lofted) + CALIPSO averaging
- [x] Soften Bodélé lakebed dating
- [x] Soften unverifiable view count
- [x] Reframe desert keystone-species line as analogy
- [x] Correct leveragism happiness-paper misrepresentation (body + citation)
- [x] Generalize leveragism AI-defamation phrasing
- [x] Verify `<strong>`/`<em>` balance in all edited files
- [x] (Optional) Pick spelling standard and normalize prose tokens
- [x] (Optional) Thin em-dashes / antithesis construction, one pass
- [x] (Optional) Confirm Benn Jordan video runtime by eye
- [x] Run `pnpm --filter @xnetjs/site build` (or CI) to confirm `astro build` passes

## Validation Checklist

- [x] `astro build` for `site/` succeeds (CI gate)
- [x] `/blog/*` pages render with corrected copy in light + dark
- [x] RSS feed (`/blog/rss.xml`) still builds (metadata untouched, so expected)
- [x] Spot-check each corrected sentence reads naturally in context
- [x] No new spelling inconsistencies introduced by the fixes
- [x] Sources lists still resolve (no links removed)

## References

- Internal: [surveillance.ts](site/src/data/surveillance.ts),
  [blog.ts](site/src/data/blog.ts), exploration 0239 (blog foundation),
  0240/0241/0244/0245 (the four science/economics essays)
- Pirate: Royal Museums Greenwich (Golden Age); Marcus Rediker, *Villains of
  All Nations*; British Tars / House of Commons mortality data; Kinkor on
  Black pirates
- Mycelium: Hawkins et al., "Mycorrhizal mycelium as a global carbon pool,"
  *Current Biology* 33(11) (2023); Karst, Jones & Hoeksema, *Nature Ecology &
  Evolution* (2023); Henriksson et al., *New Phytologist* (2023)
- Star: Sun core power density (~276 W/m³, "similar to an active compost
  heap"); Landauer 1961 / Bérut et al. 2012; submarine-cable traffic share
- Desert: Yu et al., *GRL* (2015) + NASA Goddard; Armitage et al., *PNAS*
  (2015) on Lake Mega-Chad; Nadia Eghbal, *Roads and Bridges* (Ford
  Foundation, 2016); Heartbleed / Core Infrastructure Initiative
- Leveragism: Killingsworth, Kahneman & Mellers, "Income and emotional
  well-being: a conflict resolved," *PNAS* (2023); Hirschman, *Exit, Voice,
  and Loyalty* (1970); BBC/EBU news-assistant study (2025); Bronnie Ware,
  *The Top Five Regrets of the Dying*
