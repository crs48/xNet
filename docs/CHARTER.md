# The xNet Humane Internet Charter

> _Software that serves instead of extracts._

This charter states, in plain language, the commitments xNet makes to the people
who use it — and, where possible, points at the **code or test that backs each
one**, so the promise is verifiable rather than rhetorical. It is the operational
expression of [`docs/VISION.md`](./VISION.md) and grew out of
[exploration 0234](./explorations/0234_[_]_MITIGATING_INTERNET_HARMS_A_NEO_LUDDITE_AUDIT_OF_XNET.md),
a "neo‑Luddite audit" of the project against the harms catalogued in the wider
critique of big tech (surveillance capitalism, attention extraction, platform
lock‑in, deskilling).

The test we hold ourselves to is the historical Luddites' own definition: we
refuse to ship _"machinery hurtful to commonality"_ — technology deployed to
deskill, surveil, or concentrate power. Good, honest, well‑built software passes;
extraction fails.

A commitment with no receipt is just marketing. Where a commitment is **enforced**
(a CI gate or a test), it says so. Where it is **architectural** (a property of
how the code is built), it links to that code. Where it is **aspirational** (not
yet fully built), it says that too — honesty about the gap is itself a
commitment.

This charter is the refusal side of the coin. Its companion,
[`docs/VIBE.md`](./VIBE.md), names what the refusals make room for — the feel
xNet cultivates (exploration 0352).

---

## 1. Own — you hold the master copy

Your data lives on your device first. xNet keeps no behavioral surplus and has no
third‑party customer to sell it to. There is no ad model; you are not the product.

- **Architectural:** the local store is the primary copy — event‑sourced LWW over
  OPFS‑backed SQLite ([`packages/data/src/store/store.ts`](../packages/data/src/store/store.ts),
  [`packages/sqlite/src/adapters/web.ts`](../packages/sqlite/src/adapters/web.ts)).
- **Enforced:** the humane‑patterns CI gate bans third‑party analytics/ad SDKs
  anywhere in `packages/`/`apps/`
  ([`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs),
  `surplus` rules) — there is no behavioral‑surplus pipeline to add by accident.

## 2. Exit — leaving is your right, and it loses nothing

You can take everything and go. Identity is a portable `did:key` that works on any
hub; the wire format is an open, signed, hash‑chained change log, not a vendor
blob; the client works fully offline with no hub at all.

**Refusal is not confiscation.** A host may decline to serve you — abuse reports,
legal demands and sanctions lists are real, and a host that claims it will never
say no is lying. What a host may never do is turn that no into a claim on your
work. The two are separate acts everywhere else in this industry only because the
account is the single handle anyone built; here they stay separate by
construction, because the master copy is yours, your identity is a key we do not
issue and cannot revoke, and every action moderation can take names _reach_ —
`reject`, `hide`, `quarantine`, `block-peer` — and never possession
([`packages/abuse/src/policy-blocks.ts`](../packages/abuse/src/policy-blocks.ts)).
An appeal that succeeds `reverse`s
([`packages/abuse/src/appeals.ts`](../packages/abuse/src/appeals.ts)), which is
only a meaningful word because nothing was destroyed.

- **Architectural:** portable protocol
  ([`packages/sync/src/change.ts`](../packages/sync/src/change.ts)), portable
  identity ([`packages/identity/src/keys.ts`](../packages/identity/src/keys.ts)),
  offline‑first ([`packages/runtime/src/sync/offline-queue.ts`](../packages/runtime/src/sync/offline-queue.ts)),
  workspace export
  ([`packages/plugins/src/services/ai-workspace-exporter.ts`](../packages/plugins/src/services/ai-workspace-exporter.ts),
  [`packages/data/src/database/export/json-export.ts`](../packages/data/src/database/export/json-export.ts)).
- **Aspirational:** a single, legible "export everything and go" / Delete‑Day flow
  that composes these pieces — tracked in exploration 0234 (Wave 1).

## 3. Calm — we compete for your wellbeing, not your time

We do not build the machinery of compulsion. No infinite scroll. No engagement
ranking. No streaks engineered around loss aversion. No manufactured red‑dot
anxiety. Feeds are chronological; notifications are rule‑based with an explicit
priority order, a watermark + snooze model, and a hard cap.

- **Enforced:** the motion vocabulary bans manipulative animation
  ([`scripts/check-motion-vocab.mjs`](../scripts/check-motion-vocab.mjs),
  exploration 0199) and the humane‑patterns gate bans dark‑pattern primitives —
  infinite scroll, streak counters, confirmshaming
  ([`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs),
  `dark-pattern` rules). The streak rules match the underlying math reaching a
  render path, not just identifier spellings, and cover the workbench and
  dashboard packages — a gap that let a 🔥 counter ship (exploration 0426).
- **Architectural:** chronological feeds
  ([`packages/social/src/feeds/defaults.ts`](../packages/social/src/feeds/defaults.ts)),
  rule‑based notifications
  ([`packages/comms/src/notify/rules.ts`](../packages/comms/src/notify/rules.ts)).

## 4. Consent — nothing leaves without permission

Telemetry is **off by default**. Nothing is sent until you choose a tier, and what
is sent is PII‑scrubbed and **bucketed into ranges** (counts, latencies and sizes
become bands like `10-50ms`) so a value can't be tied back to a single user. This
is range bucketing, not a formal differential‑privacy or minimum‑group‑size
guarantee — the honest word is "bucketed," not "k‑anonymized" (exploration 0257).

- **Architectural / tested:** the consent spine
  ([`packages/telemetry/src/consent/manager.ts`](../packages/telemetry/src/consent/manager.ts)),
  scrubbing ([`packages/telemetry/src/collection/scrubbing.ts`](../packages/telemetry/src/collection/scrubbing.ts)),
  bucketing ([`packages/telemetry/src/collection/bucketing.ts`](../packages/telemetry/src/collection/bucketing.ts)),
  governed outbound fetch
  ([`packages/core/src/utils/ssrf.ts`](../packages/core/src/utils/ssrf.ts)),
  exploration 0210.
- **Aspirational:** a "what we know about you" mirror that enumerates every derived
  artifact (vectors, AI memory, telemetry buffer) and lets you purge any of it —
  tracked in exploration 0234 (Wave 2).

## 5. Agency — AI makes you more capable, not less

AI is bring‑your‑own and local‑capable; the second brain cites its sources and
respects authorization. By default the assistant **scaffolds** — it proposes and
cites, you write and own — rather than silently doing your thinking for you (a
direct answer to the MIT "cognitive debt" finding on LLM deskilling). Anything the
model authored is marked as `ai-generated` provenance.

**Why scaffolding is the default, and not timidity:** the autonomy a feature may
take is bounded by how cheaply it can be revoked and how completely you leave
with your data — see [`VIBE.md`](./VIBE.md) §"Surrender scales with exit"
(exploration 0426). Handing the wheel to your own judgement is one thing;
handing it to a vendor's model is another, and §Exit is what keeps the two
distinguishable. That makes §Exit a precondition on every autonomy feature here,
not a separate promise about portability.

**`draft` mode is yours to choose, in Settings › AI.** The default is
`scaffold`, and the choice states its own cost rather than selling the faster
option. Saying "opt‑in only" while providing no way to opt in would describe an
internal default and call it a freedom — which is the failure §Agency's second
half exists to catch (exploration 0428).

- **Architectural / tested:** governed GraphRAG retrieval
  ([`packages/brain/src/retrieve.ts`](../packages/brain/src/retrieve.ts)),
  provenance tiers ([`packages/trust/src/index.ts`](../packages/trust/src/index.ts)),
  the runtime's default `scaffold` assist mode + `ai-generated` turn provenance
  ([`packages/plugins/src/ai/runtime.ts`](../packages/plugins/src/ai/runtime.ts)),
  and the opt‑in itself — Settings › AI, backed by
  [`packages/workbench/src/lib/ai-assist.ts`](../packages/workbench/src/lib/ai-assist.ts)
  (exploration 0428).
- **Aspirational:** surfacing citations + an `ai-generated` badge in the editor UI
  — tracked in exploration 0234 (Wave 2).

### You can see what you are able to do

The commitment above is only half of agency. Cate Hall's definition —
[_Can You Just Do Things?_, Asterisk 12](https://asteriskmag.com/issues/12/can-you-just-do-things)
— is the capacity to **both see and act on** the degrees of freedom available
to you, and the word doing the work is _both_. Everything above answers _"we
did not take capability away from you."_ This answers the other half.

**A capability you cannot see is not a degree of freedom you have.** A feature
reachable only by knowing a `localStorage` key, reading the source, or asking
the assistant the right question is folklore, not agency — and it fails the
people whose constraints are tightest, which is the opposite of what the slogan
claims for itself. The burden of making a capability visible belongs to the
tool, not to the user.

Concretely: every user‑flippable capability is declared in the capability
register with at least one surface a person could find it through — a Labs
toggle, a named Settings control, a first‑run coachmark, or a command — or it
carries a written reason it is deliberately internal, in the same shape as the
`humane-ok` escape hatch below. Adding a capability with no surface and no
reason fails the build.

- **Enforced:** the capability‑surface gate
  ([`scripts/check-capability-surface.mjs`](../scripts/check-capability-surface.mjs))
  scans the source for `xnet:experiment:*` flags, requires each to be declared in
  [`apps/web/src/lib/capabilities.ts`](../apps/web/src/lib/capabilities.ts), and
  fails on any entry with no surface and no `hidden` reason; the receipt is
  pinned by `agency-capabilities-are-visible` in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)
  (exploration 0428).
- **Aspirational:** the register covers experiment flags and the assist mode
  today. Commands, keyboard shortcuts, and plugin capabilities are not yet in
  scope — widening the population is tracked in exploration 0428, deliberately
  after the first population has held green.

> [!NOTE]
> This does **not** license a product tour, a nag, or a "did you know" feed.
> Calm (§3) still binds: the answer is a contextual, dismissible, one‑at‑a‑time
> coachmark and an honest Settings row, never an interruption that teaches you
> to wait for the app to tell you what to do next.

## 6. Commons — you own your audience and your space

Your social graph and your audience belong to you, not to a platform that rents
them back. Hubs are user‑ownable and federated; sharing is durable links you
control.

- **Architectural:** BYO hub ([`packages/hub/src/cli.ts`](../packages/hub/src/cli.ts)),
  the BYO‑backend server kit (`@xnetjs/server`), durable share links.
- **Aspirational:** "own your audience" publishing — publish from your graph to an
  owned page with a portable, DID‑based subscriber list — tracked in
  exploration 0234 (Wave 3).

### No ground rent

The Commons commitment has an economic edge
([exploration 0351](./explorations/0351_[x]_FRONTIER_ECONOMICS_WITHOUT_ENCLOSURE_RAILROADS_AIRLINES_AND_THE_COMMONS.md)):
xNet charges for **improvements** — operations, support, context, and
distribution we build and run — and never for **ground rent**: access to
things you would own anyway. The refused rents, each with its receipt:

- **No take rate on direct creator sales.** Payments for your work settle on
  your own account; xNet is not in the flow of funds. **Aspirational:** the
  policy and design are fixed in
  [exploration 0349](./explorations/0349_[_]_FIRST_CLASS_PAYMENTS_CREATOR_COMMERCE_AND_ECONOMIC_EXCHANGE.md)
  (Stripe Connect Standard direct charges, 0%); the payments feature itself
  has not shipped yet.
- **No egress or export fees.** You can export everything, verified, for
  free. **Architectural:** portable `.xnetpack` bundles
  ([`packages/data/src/portability/`](../packages/data/src/portability/),
  exploration 0344), JSON export
  ([`packages/data/src/database/export/json-export.ts`](../packages/data/src/database/export/json-export.ts));
  the claims ledger pins this receipt to the portability regression suite
  (`commons-no-ground-rent-export` in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)).
- **No identity ransom.** Your `did:key` is minted by you and works on any
  hub (§2). **Architectural:**
  [`packages/identity/src/keys.ts`](../packages/identity/src/keys.ts).
- **No protocol tolls.** The wire format, client, and hub are MIT; the
  entitlements contract is MIT and dependency‑free, so a self‑hosted hub
  never phones home to us. **Architectural:** root [`LICENSE`](../LICENSE),
  [`packages/sync/src/change.ts`](../packages/sync/src/change.ts),
  [`packages/entitlements/`](../packages/entitlements/).
- **No rent on storage you could hold yourself.** Cloud storage add‑ons are
  billed on the bytes we rent, replicate and back up for you — an operation we
  run — never on reaching data you already own. Keeping it on your own devices
  stays free and unlimited, export stays free, egress is zero, and the same hub
  self‑hosts against your own bucket. **Enforced:** the add‑on is per tenant and
  additive over the plan base, so it can neither become a per‑member meter
  through the storage door nor shrink a tenant who changes plan
  ([`packages/entitlements/src/plans.ts`](../packages/entitlements/src/plans.ts),
  `withStoragePack`); the receipt is pinned by
  `commons-storage-is-an-improvement-charge` in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)
  (exploration 0435, ADR‑33).
- **No per‑member pricing on communities.** Hosting is billed on the
  operations we run — storage, concurrency, AI — never on the size of the
  audience you brought. A per‑member meter would charge you for access to a
  relationship we did not build, and would make your own growth the thing you
  pay us for. **Enforced:** the `community` plan is flat‑billed (`seats: 0`,
  meaning _not seat‑metered_) and `withSeats()` refuses to attach a seat count
  to it, so the meter cannot return through an override
  ([`packages/entitlements/src/plans.ts`](../packages/entitlements/src/plans.ts));
  the receipt is pinned by `never seat-meters the community plan` in
  [`packages/entitlements/src/plans.test.ts`](../packages/entitlements/src/plans.test.ts)
  (exploration 0359).
- **No rent on introductions.** The people‑matching layer
  ([`packages/social/src/connect/`](../packages/social/src/connect/)) never
  sells the introduction: no boost, no paid rank, no pay‑to‑reveal. An
  operator paid for access to matches has a standing reason to make matches
  scarce — scarcity becomes inventory — so the lane is refused outright and
  connection rides the flat hosting bill like any other workload. **Enforced:**
  the `metered connection` rule in
  [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs)
  fails CI on meter identifiers (`boostPrice`, `paidVisibility`,
  `payToReveal`, …); the receipt is pinned by `commons-no-rent-on-introductions`
  in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)
  (exploration 0417).
- **No scored intimacy.** Relationships are made legible, never scored. xNet
  will record what two people actually do together — the shared activities a
  label like "friend" compresses away — and will derive a reading from them.
  It will not grade that reading: no relationship health score, no closeness
  ranking, no list of the people you are neglecting. A score is the artefact an
  operator sells, and it inverts the purpose — the point is to be intentional
  about a relationship, not to be measured against it. So a derivation returns
  a **set difference** (activities common to this kind of relationship that you
  don't share) and never a number standing for the relationship itself.
  **Enforced:** the `scored intimacy` rule in
  [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs)
  fails CI on scoring identifiers (`relationshipScore`, `friendshipScore`,
  `connectionHealth`, `neglectedContacts`, …); the receipt is pinned by
  `commons-no-scored-intimacy` in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)
  (exploration 0422).
- **No sustainability upcharge.** Efficiency is not a tier. We will not sell a
  "green," "carbon‑neutral" or "eco" hosting SKU, and we will not claim xNet is
  greener than any alternative. Both refusals have the same root: a margin
  earned on a clean tier is a standing reason to keep the default tier dirty —
  the introductions problem (above) wearing a leaf. Whatever efficiency work we
  do rides the flat hosting bill, and the only material claim we make is the
  one in §7, which is measured rather than asserted. **Enforced:** the
  `unbacked green claim` rule in
  [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs)
  fails CI on marketing identifiers (`carbonNeutral`, `co2Saved`, `greenTier`,
  `ecoBadge`, …); the receipt is pinned by `floor-no-sustainability-upcharge`
  in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts)
  (exploration 0434).
- **No behavioural surplus.** Restates §1 as a refused rent. **Enforced:**
  [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs)
  (`surplus` rules).
- **No global chokepoint tier.** We do not operate an indispensable middle to
  rent back later: relays are bounded, hubs are user‑ownable.
  **Architectural:** the decision is recorded in exploration 0333 and the hub
  is a single self‑contained process
  ([`packages/hub/src/cli.ts`](../packages/hub/src/cli.ts)).
- **A FRAND trademark.** The name never fences the code (see
  [`TRADEMARK.md`](../TRADEMARK.md)).
- **No context capture.** Portability covers the _context_, not just the
  bytes: an audience, share grants, and plugin licences travel with the
  export. Data you can move while your standing stays behind is the moat we
  refuse — a repository is portable, a contribution graph is not.
  **Building:** the `.xnetpack` inventory in
  [`docs/ECONOMICS.md`](./ECONOMICS.md) names what travels today and what does
  not, and the `economics-no-context-capture` claim tracks the gap
  (exploration 0358).
- **No marketplace self‑preferencing.** xNet's own listings receive no ranking
  preference over anyone else's, and delisting is limited to the grounds
  enumerated in the public marketplace terms.
  **Architectural:** the sovereign 0% BYO‑billing path and the MIT catalog mean
  a self‑hoster can run their own marketplace
  ([exploration 0196](./explorations/0196_[_]_PAID_PLUGIN_MARKETPLACE_MONETIZATION_AND_LICENSING.md)).
- **No rent on your published social graph.** When you publish what you saved,
  the records go into **your own** AT Protocol repo — never ours. xNet runs the
  _appview_ that compares two people's published sets, and bills for that
  compute as part of hosting, never as its own tier. The comparison shows
  overlap between two named people and nothing else: no ranking, no global
  count, no "most‑saved". A public like corpus with a scoreboard is a
  recommender, and we do not build one.
  **Architectural:** records are written to the user's PDS by
  [`packages/social/src/publish/`](../packages/social/src/publish/); the
  appview is derived‑only and self‑hostable with `xnet hub --role index`
  ([`packages/hub/src/features/affinity.ts`](../packages/hub/src/features/affinity.ts)).
  **Enforced:** `no scoreboard` in
  [`packages/hub/test/affinity.test.ts`](../packages/hub/test/affinity.test.ts)
  fails the build if a ranking route appears (exploration 0420).

Covenants are tested in down quarters, not up ones — so the test lives here,
not in anyone's memory. **Every new revenue lane must pass five tests before
it ships:**

1. **Improvement test** — the margin pays for labour, capital, or operations
   _we_ provide, not for access to something users would own anyway.
2. **BATNA test** — after the lane ships, self‑hosting remains a real,
   undegraded alternative.
3. **Vanish test** — if xNet‑the‑company disappeared tomorrow, what the
   customer paid for (their data, their audience, their workflows) survives.
4. **Sleep test** — if a well‑funded competitor shipped our entire feature set
   as open source tomorrow, which revenue lines survive? A lane whose answer is
   "none" is a cliff (exploration 0358).
5. **Rust test** — if we keep every refusal above and a competitor keeps none,
   do we still reach the people we are refusing on behalf of? **Every refusal
   must name at least one shipped or building lane that survives it.** A
   refusal with no surviving lane is not forbidden — it is on borrowed time,
   and must be labelled so (exploration 0429).

The first three ask whether a lane is fair to the user. The fourth asks whether
it is durable for us, and it exists because those are not the same question:

> _Rent fails all at once; improvement fails gradually. We take improvement
> margins not only because rent is unfair, but because a company defending a
> cliff will eventually break every other promise in this document to keep
> from falling off it._

The fifth asks whether the refusals are affordable, which is a different
question again. John and Mack Rust invented the mechanical cotton picker in the
1930s and attached to it every refusal this document would recognise: the
patents went into a nonprofit foundation, their own pay was capped at ten times
their lowest‑paid worker, machines were to be leased only to planters accepting
fair wages, and they offered marketing control to the Southern Tenant Farmers
Union. The company went bankrupt around 1940. International Harvester shipped a
mass‑produced picker in December 1942 with none of it attached, and the
mechanisation of the Cotton South proceeded as if the Rusts had never existed.

> _A refusal kept only by a company nobody uses is a refusal that never
> happened. The Rust test exists so that "we must stay competitive in order to
> influence the field" has to be answered in calm, in writing, and in advance —
> rather than arriving as a reason to drop a promise in the quarter we can
> least afford to examine it._

A lane that fails any of the first four tests is redesigned or refused. A
refusal that fails the fifth is kept and **labelled as on borrowed time** —
the Rust test never authorises dropping a refusal, which remains a change to
this document and needs its own ADR. Exploration documents that propose a
revenue lane should apply all five tests explicitly.

**Worked example — the affinity appview (exploration 0420).** Improvement:
✅ the margin pays for crawl, index and compare compute we run; the records
themselves are the user's and free for anyone to read from their PDS. BATNA:
✅ the index role is MIT and derived‑only, so self‑hosting is one flag away,
undegraded. Vanish: ✅ every published edge lives in the user's own repo and
any appview can rebuild the comparison from the relay — which is exactly why
xNet operating a PDS for people was **rejected**. Sleep: ⚠️ **weak** — a
competitor open‑sourcing the appview tomorrow would take this lane to roughly
zero, because the durable labour is the archive importers and local
enrichment, not the index. That honest answer is why it is folded into
hosting and **never priced as its own SKU**: a standalone tier would have
nothing to defend it but being the incumbent index, which is the global
chokepoint rent this section already refuses.

The per‑refusal Rust verdicts — which lane pays for each refusal above, and
which refusal is currently on borrowed time — are kept in
[`ECONOMICS.md`](./ECONOMICS.md) §4a, so they can be revised as lanes ship
without reopening this covenant.

### Who can change this section

The refused rents and the five tests bind people who cannot merge a PR — plugin
authors, self-hosters, hub operators, paying customers. So they are an
**in-scope operational rule** under the
[Rule Change Proposal process](./RULE_CHANGES.md): anyone affected can propose
changing them, and gets a public written answer with reasoning within 30 days,
recorded in [`docs/decisions/rule-changes.md`](./decisions/rule-changes.md).

This is what makes §6 answerable rather than merely stated. A covenant only the
covenantor may amend, silently, is a preference. The decision log's seed entries
include both of the refusals above that exploration 0358 added, a proposal we
**declined** (relicensing the core under copyleft), and a revenue lane we
**withdrew** after proposing it — because a record of only the flattering
decisions is marketing (exploration 0361).

## 7. Floor — your old hardware keeps working

Software is how working computers become waste. Manufacturing is roughly 70–90%
of a personal device's lifetime emissions, so the fastest way for an application
to do environmental harm is not to burn CPU — it is to **make a working machine
feel broken** until someone replaces it. Windows 10's support cut‑off is the
scale of that mechanism: hundreds of millions of functioning devices pushed
toward replacement by a software decision.

So xNet declares a **floor**: the oldest machine we promise to work on, what the
app costs to run there, and a CI gate that fails a change which raises it.

> The floor is a justice commitment before it is an ecological one. A tool that
> quietly requires this year's laptop has decided who is allowed to use it.

**The declared floor** (`floor` block in
[`footprint-baseline.json`](../footprint-baseline.json)): a 2017‑class laptop,
dual‑core x86‑64, **8 GB RAM**, on the oldest OS our shell supports — macOS 11
Big Sur, Windows 10, or a glibc‑2.31‑era Linux (Electron 33 / Chromium 130).
Raising any of those is a deliberate, reviewed change to this document, never a
side effect of a dependency bump.

**What we do not claim.** We make no carbon claim, and §6's "no sustainability
upcharge" is the refused rent that goes with it. Local‑first is not obviously
greener than a well‑run data centre — hyperscale PUE runs ≈1.1–1.2, the
Sustainable Web Design model puts user devices at the _heaviest_ energy
coefficient of the four segments, and a space replicated across nine devices is
nine copies doing nine merges. "Greener" would be marketing. "Your old laptop
keeps working" is measurable, so that is the only claim we make.

- **Enforced:** the footprint ratchet
  ([`scripts/check-footprint-budget.mjs`](../scripts/check-footprint-budget.mjs))
  measures the bytes a first load actually costs and fails when a change
  regresses past the committed baseline. It ratchets against
  [`footprint-baseline.json`](../footprint-baseline.json) rather than an
  absolute, and a metric that stops being measurable fails as `unmeasured`
  rather than passing — absent and unreadable are different values. The
  greenwashing half is enforced by the `unbacked green claim` rule in
  [`scripts/check-humane-patterns.mjs`](../scripts/check-humane-patterns.mjs).
  Both receipts are pinned by `floor-old-hardware-keeps-working` and
  `floor-no-sustainability-upcharge` in
  [`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts).
- **Architectural:** the properties that make an old machine viable are already
  load‑bearing — the local store is the primary copy (§1), the client works with
  no hub at all
  ([`packages/runtime/src/sync/offline-queue.ts`](../packages/runtime/src/sync/offline-queue.ts)),
  one hub dying is survivable
  ([`packages/runtime/src/sync/MultiHubSyncManager.ts`](../packages/runtime/src/sync/MultiHubSyncManager.ts)),
  and old protocol versions keep working rather than being cut off
  ([`packages/sync/src/negotiation.ts`](../packages/sync/src/negotiation.ts),
  [`packages/sync/src/deprecation.ts`](../packages/sync/src/deprecation.ts)).
- **Aspirational:** cold‑open time and peak memory **on the floor device
  itself** cannot be measured by a cloud runner, so they are recorded by hand
  and carry a `measuredAt` date the gate checks for staleness. That is a weaker
  receipt than the byte budget and is labelled as one. Widening the gate to the
  hub — "runs on a Raspberry Pi" — is tracked in exploration 0434 and
  deliberately deferred until the client budget has held green.

---

## Cryptographic posture (post‑quantum)

The change protocol is versioned at `CURRENT_PROTOCOL_VERSION = 4`, which defines
**hybrid** signatures (Ed25519 + ML‑DSA). That machinery is built and tested
([`packages/crypto/src/hybrid-signing.ts`](../packages/crypto/src/hybrid-signing.ts)),
so post‑quantum protection is available, not theoretical.

The **shipped default is `DEFAULT_SECURITY_LEVEL = 0`** (classical Ed25519). This is
a deliberate, documented choice, not an oversight: ML‑DSA signatures are large, and
raising the default across every high‑volume change has a size/performance cost that
warrants a benchmark before it becomes the norm. The likely first step is hybrid on
long‑lived **identity** keys while high‑volume changes stay Ed25519. Flipping the
default is a visible, reviewed change — the `pq-posture-declared` entry in the
claims‑ledger (`packages/telemetry/test/charter-claims-ledger.test.ts`) fails the
build if the default moves outside the intended range without an update here
(exploration 0257).

---

## The `humane-ok` escape hatch

The humane‑patterns gate is a guard, not a straitjacket. Occasionally a banned
token appears for a legitimate reason (a test fixture, a comment explaining why we
_avoid_ a pattern, an unavoidable third‑party constraint). To allow it, put a
justification comment **in the same file**:

```ts
/* humane-ok: virtualized list, not engagement-driven infinite scroll — see 0234 */
```

The reason is required: the comment must explain _why_ the exception is honest.
Allowing an exception without a written reason is itself a violation. Reviewers
should treat every `humane-ok` as a small design decision worth a second look.

## How this charter stays honest

- Every **Enforced** claim maps to a CI gate that fails the build on regression.
- Every **Architectural** claim links to the code that makes it true.
- Every **Aspirational** claim names where the gap is tracked, so the charter
  never over‑promises.
- New work that would weaken a commitment should update this charter in the same
  change — and explain itself.
- The charter is also backed by how xNet is **run** and **named**:
  [`GOVERNANCE.md`](../GOVERNANCE.md) keeps decision-making legible and commits to
  shared governance over time, and [`TRADEMARK.md`](../TRADEMARK.md) is how "Exit"
  (§2) and "Commons" (§6) become brand rules — the code is free to fork and
  re‑implement; the name only protects users from confusion, never from leaving.
