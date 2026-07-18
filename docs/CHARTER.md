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
  `dark-pattern` rules).
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

- **Architectural / tested:** governed GraphRAG retrieval
  ([`packages/brain/src/retrieve.ts`](../packages/brain/src/retrieve.ts)),
  provenance tiers ([`packages/trust/src/index.ts`](../packages/trust/src/index.ts)),
  the runtime's default `scaffold` assist mode + `ai-generated` turn provenance
  ([`packages/plugins/src/ai/runtime.ts`](../packages/plugins/src/ai/runtime.ts)).
- **Aspirational:** surfacing citations + an `ai-generated` badge in the editor UI
  — tracked in exploration 0234 (Wave 2).

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
([exploration 0351](./explorations/0351_[_]_FRONTIER_ECONOMICS_WITHOUT_ENCLOSURE_RAILROADS_AIRLINES_AND_THE_COMMONS.md)):
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
  ([`packages/data/src/database/export/json-export.ts`](../packages/data/src/database/export/json-export.ts)).
- **No identity ransom.** Your `did:key` is minted by you and works on any
  hub (§2). **Architectural:**
  [`packages/identity/src/keys.ts`](../packages/identity/src/keys.ts).
- **No protocol tolls.** The wire format, client, and hub are MIT; the
  entitlements contract is MIT and dependency‑free, so a self‑hosted hub
  never phones home to us. **Architectural:** root [`LICENSE`](../LICENSE),
  [`packages/sync/src/change.ts`](../packages/sync/src/change.ts),
  [`packages/entitlements/`](../packages/entitlements/).
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

Covenants are tested in down quarters, not up ones — so the test lives here,
not in anyone's memory. **Every new revenue lane must pass three tests before
it ships:**

1. **Improvement test** — the margin pays for labour, capital, or operations
   *we* provide, not for access to something users would own anyway.
2. **BATNA test** — after the lane ships, self‑hosting remains a real,
   undegraded alternative.
3. **Vanish test** — if xNet‑the‑company disappeared tomorrow, what the
   customer paid for (their data, their audience, their workflows) survives.

A lane that fails any test is redesigned or refused. Exploration documents
that propose a revenue lane should apply the three tests explicitly.

---

## Cryptographic posture (post‑quantum)

The change protocol is versioned at `CURRENT_PROTOCOL_VERSION = 3`, which defines
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
