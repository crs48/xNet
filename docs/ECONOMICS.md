# How xNet Makes Money

> [`CHARTER.md`](./CHARTER.md) is what we refuse.
> [`VIBE.md`](./VIBE.md) is what we cultivate.
> This is **how we get paid, why that is stable, and what it costs us.**

Exploration [0358](./explorations/0358_[x]_VALUE_CAPTURE_WITHOUT_ENCLOSURE_MOATS_SUBSTRATES_AND_THE_SLEEP_TEST.md)
produced this document. It exists because the economic reasoning was
distributed across four open explorations and one Charter subsection, which
meant it was effectively unstated for anyone not reading `docs/explorations/`
in full.

---

## 1. Rent is a cliff. Improvement is a slope.

On 30 September 1996, Bill Gates emailed Nathan Myhrvold under the subject
line *"Java runtime becomes the operating system"* and wrote that he was
"literally losing sleep over this issue."

He was not worried that a competitor would sell more copies. He was worried
that the *layer at which value is captured* would move up one, and that
Microsoft's **position** — not its products — would evaporate underneath it.

That fear is a property of the position, not the person:

- **Rent fails discontinuously.** You hold the toll-collecting position or you
  do not. A challenger does not shave a rent, it relocates it. Every
  competitor is therefore existential.
- **Improvement fails gradually.** A better competitor takes some share; you
  get better and take some back. There is no absorbing state one step away.

**You only lose sleep on cliffs.** We take improvement margins not only
because rent is unfair, but because a company defending a cliff will
eventually break every promise in the Charter to keep from falling off it.

### The identity we are betting against

Shapiro and Varian, *Information Rules* (1998), ch. 5:

> "the profits a supplier can expect to earn from a customer are equal to the
> total switching costs… plus the value of other competitive advantages."

Read the inverse and you have xNet's wager stated in the incumbents' own
textbook:

> **Enterprise value ≈ total switching costs + genuine advantage.**
> We delete the first term on purpose and are valued on the second alone.

Their Table 5.1 names the switching cost that grows fastest over time:
*information and databases*. That is precisely the term `.xnetpack` zeroes out
([`packages/data/src/portability/`](../packages/data/src/portability/)).

---

## 2. The Moat Register

The Charter's §6 lists seven refused rents. It does not say what we **keep**.
Both halves belong in the open. Honesty labels match the Charter's vocabulary:
**Enforced** (a gate fails the build), **Architectural** (the code shape makes
it true), **Aspirational** (stated policy, not yet shipped).

### Refused — cliff-shaped

| Moat | Why refused | Status |
| --- | --- | --- |
| **Position rent** (API toll, app-store tax) | Binary failure mode; the 1996 email | Architectural — no layer we own to toll |
| **Data gravity** (egress fees, format capture) | Charges for something the user already owns | Architectural — `.xnetpack`, free and verified |
| **Context capture** (non-portable audience, grants, reputation, policy plane) | The most tempting one, and the one we lose most by refusing — see §3 | **Building** |
| **Behavioural surplus** (attention resale) | Restates Charter §1 | **Enforced** — `scripts/check-humane-patterns.mjs` |
| **Default-position rent** (being the hardcoded default, then changing terms) | Docker Hub, 2 Nov 2020: an open format is still a chokepoint if you are the default | Architectural — see §5 |
| **Marketplace self-preferencing** | Ranking our own listings above others | Architectural — 0% BYO-billing path, MIT catalog |

### Kept — slope-shaped

These can all be taken from us **by someone being better**. None can be taken
at a stroke by a change in the layer beneath us, because we do not depend on
owning a layer.

| Moat | What it is | Receipt |
| --- | --- | --- |
| **Operated trust** | Uptime, backups that verifiably restore, support, indemnity, someone on the hook at 3am | `packages/cloud/src/litestream/`, `backup/restore-drill.ts` |
| **Integration surplus** | Things that work together across device, hub and client | See the design rule in [`VIBE.md`](./VIBE.md) |
| **Execution lead** | Shipping faster than the market — four independent protocol kernels, the hooks API | `packages/react/`, `conformance/` |
| **Taste** | The scene wants to be here | [`VIBE.md`](./VIBE.md) |

> **The Red-Hat-shaped temptation, named in advance.** In June 2023 Red Hat —
> the standing proof that open-source business models need no enclosure —
> restricted RHEL sources with the argument that *"simply rebuilding code,
> without adding value… represents a real threat to open source companies
> everywhere."* It cost them the position rather than the revenue.
>
> Ours will arrive dressed the same way: as fairness, aimed at free-riders
> rather than users, and framed as protecting the people who do the work. The
> most likely concrete form is **quietly degrading self-hosting** through an
> operationally painful but technically permitted path — cloud-only relay
> performance, a slow default, an undocumented requirement. If you are reading
> this while making that argument, the argument is the symptom.

**This register is an in-scope rule.** Which moats we refuse and which we keep
binds everyone downstream of a pricing or positioning decision, and until
recently it could be rewritten by a maintainer commit with no external path.
Anyone affected can now propose changing it through the
[Rule Change Proposal process](./RULE_CHANGES.md); the answer, including a
refusal, is written down in
[`docs/decisions/rule-changes.md`](./decisions/rule-changes.md). That is the
mechanism by which the paragraph above is more than a promise to ourselves —
the Red-Hat-shaped argument, if it ever gets made here, has to be made in
public and answered on the record.

---

## 3. What actually travels — the context-portability inventory

"You can leave with your data" is only true to the depth of the bundle. GitHub
publishes what its own migrations do *not* carry; so should we. Everything
below is checked against
[`packages/data/src/portability/types.ts`](../packages/data/src/portability/types.ts).

### In the bundle today

| Carried | Where |
| --- | --- |
| The signed, hash-chained change log (every node, with `authorDid`, `parentHash`, signature) | `changes.ndjson` |
| Batch commits (exploration 0357) | `commits.ndjson` |
| Content-addressed blobs + index | `blobs.ndjson`, `blobs/<algo>/<hex>` |
| Yjs document states (prose) | `yjs/docs.ndjson` |
| A manifest signed by the exporting DID | `manifest.json` |

Because every record carries its own hash, parent hash, author DID and
signature, **integrity and provenance survive the trip** — and a fork is a
complete replica, not a reference.

### NOT in the bundle — the honest gap

| Not carried | Where it lives instead | Consequence |
| --- | --- | --- |
| **Share links** (8 doc types, roles, hashed secrets) | Hub storage (`packages/hub/src/storage/`) | Links break on migration; recipients must be re-invited |
| **Grants / capability records** | Hub-managed; explicitly auth-exempt (`packages/data/src/schema/schemas/auth-exempt.ts`) | Access policy must be rebuilt on the new hub |
| **Subscriber list / audience** | Not built (0234 Wave 3) | The Charter's Commons promise is `building`, not shipped |
| **Plugin licences** | DID-bound tokens, verified offline (`packages/licenses/`) | Portable in principle; migration path unwritten |
| **Presence / awareness** | Ephemeral by design (0249) | Correctly excluded — not a gap |

**This table is the point.** Rows 1–4 are exactly the "portable bytes, captive
context" pattern we refuse in §2, and today we are partly guilty of it. The
`economics-no-context-capture` entry in the claims ledger
([`packages/telemetry/test/charter-claims-ledger.test.ts`](../packages/telemetry/test/charter-claims-ledger.test.ts))
holds this open as declared honesty-debt rather than letting it pass silently.
Every future row added here is either fixed or disclosed — never omitted.

---

## 4. The four tests, applied to every current lane

From [`CHARTER.md`](./CHARTER.md) §6. The first three ask whether a lane is
fair to the user; the fourth asks whether it is durable for us.

| Lane | Improvement | BATNA | Vanish | Sleep |
| --- | --- | --- | --- | --- |
| Hub hosting + ops (`personal`…`enterprise`) | ✅ real servers, backups, uptime | ✅ same MIT hub self-hostable; entitlements are MIT and never phone home | ✅ `.xnetpack` out, self-host in | ✅ someone must still run it |
| AI metering (`includedAiUsd` / `aiMonthlyBudgetUsd`) | ✅ pass-through + real inference COGS | ✅ BYO-key path preserved | ✅ outputs are nodes in your log | ✅ COGS is COGS |
| Support / SLA / indemnity | ✅ pure labour and risk transfer | ✅ unaffected | ✅ nothing sealed to us | ✅ labour |
| Managed marketplace listing (10%) | ✅ distribution work we perform | ✅ BYO-billing path is 0% and MIT | ✅ licences DID-bound, offline-verifiable | ✅ running a store is operating |
| Direct creator sales (**0%**) | n/a — refused | ✅ | ✅ | n/a |

A lane that would fail: **"sync quota"** or **"premium protocol version."**
Both charge for access to something the user already owns, and neither
survives a competitor open-sourcing the feature set. Neither exists.

---

## 5. Anchor tenancy — the one honest railroad move

We are the anchor tenant on a substrate we do not own: **xNet Cloud runs the
same hub anyone else can run.**

- The hub is a single self-contained process
  ([`packages/hub/src/cli.ts`](../packages/hub/src/cli.ts)).
- The paid-plan contract is **MIT and dependency-free**
  ([`packages/entitlements/`](../packages/entitlements/)) and travels as a
  signed `HUB_PLAN` token, so **a self-hosted hub never phones home.**
- Exactly one package is source-available
  ([`packages/cloud/`](../packages/cloud/), FSL-1.1-Apache-2.0, auto-opening to
  Apache-2.0 after two years), and
  [`scripts/check-cloud-boundary.sh`](../scripts/check-cloud-boundary.sh) proves
  the hub never imports it.
- That script also asserts **no Cloud-only hub fork exists** and that hub
  images are pinned to immutable tags, never `latest`.

The commitment in one line: **we run trains on tracks anyone may use.** If we
ever ship a hub the public cannot install, the boundary check fails the build.

### Mirror, not master

If we build a discovery index, it must be **reproducible**: crawl input is
public bundles, output is a signed artifact, and a third party running the same
crawler must be able to produce an equivalent index. We compete on running it
well — freshness, ranking, spam resistance, uptime — never on being the only
one who can.

This is not a nicety. npm is mirrorable and *still* a chokepoint three ways:
it reassigned the `kik` package name without the author's consent; the
`ua-parser-js` maintainer could not unpublish his own hijacked versions; and
sanctioned users of the surrounding platform could neither export **nor
delete** their own content. The lesson is that **governance, not architecture,
decides whether an index is a value-add or a chokepoint** — so the
reproducibility gate belongs in CI from the first index commit, not later.

---

## 6. What this position costs us

A document that only lists advantages is marketing. Three real costs:

1. **No friction buffer.** Once exit is free, a bad quarter has nothing to hide
   behind. Mandated-portability experiments show that removing switching costs
   shifts share toward whoever is actually better — which cuts both ways, and
   quickly.
2. **We refused the layer that historically did the retaining.** Git made exit
   nearly free and GitHub was still worth $7.5B, because the contribution
   graph, profile and teams do not travel. That is the "context capture" row in
   §2, and refusing it is the most expensive decision in the Charter. Our
   answer is operated trust plus multiplayer — both slopes, both weaker per
   unit than a captive graph, and we should say so rather than pretend
   otherwise.
3. **Delight is a flow, not a stock.** Heroku had the most beloved deploy
   experience of its era and, under an owner with different incentives, was
   moved to maintenance mode. Whatever we build has to be re-earned on a
   schedule, with a named owner.

The compensating argument is that lock-in did not save Heroku either: its real
switching costs converted into resentment rather than retention, and users who
feel trapped leave at the first forced migration. **Lock-in retains only while
the product is also good; when it stops being good, lock-in accelerates the
exit.**

---

## 7. Where the reasoning lives

| Exploration | Contribution |
| --- | --- |
| [0351](./explorations/0351_[x]_FRONTIER_ECONOMICS_WITHOUT_ENCLOSURE_RAILROADS_AIRLINES_AND_THE_COMMONS.md) | The Georgist operator; "operated trust" as the scarce resource; the three tests |
| [0336](./explorations/0336_[_]_COMPARATIVE_CLOUD_ECONOMICS_AND_XNET_CLOUD_POSITIONING.md) | "Sell the operations, not the bytes; charge for context, not capability"; margin structure; the three ways this dies |
| [0349](./explorations/0349_[_]_FIRST_CLASS_PAYMENTS_CREATOR_COMMERCE_AND_ECONOMIC_EXCHANGE.md) | 0% on direct creator sales; payment-mints-capability; receipts-as-nodes |
| [0196](./explorations/0196_[_]_PAID_PLUGIN_MARKETPLACE_MONETIZATION_AND_LICENSING.md) | The 10% managed lane vs the 0% sovereign lane |
| [0358](./explorations/0358_[x]_VALUE_CAPTURE_WITHOUT_ENCLOSURE_MOATS_SUBSTRATES_AND_THE_SLEEP_TEST.md) | The rent/improvement frame, the Sleep test, this register |

The plan ladder itself is machine-readable in
[`packages/entitlements/src/plans.ts`](../packages/entitlements/src/plans.ts);
the public mirror is [`site/src/data/pricing.ts`](../site/src/data/pricing.ts).
