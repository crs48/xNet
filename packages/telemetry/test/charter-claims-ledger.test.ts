/**
 * The claims <-> code conformance ledger (exploration 0257).
 *
 * xNet's essays and Charter make load-bearing, present-tense promises. This
 * suite is the governor that keeps those promises from silently drifting ahead
 * of what the code actually ships: every enumerated claim is tied to a code
 * fact, an enforcing regression test, or an explicit `pending` marker.
 *
 * The rule (asserted structurally below): a claim declares EXACTLY ONE backing —
 *   - `assert`     an executable check of a shipped default / code fact
 *   - `enforcedBy` a path to the regression test that already guards the claim
 *   - `pending`    a known, disclosed gap (the essay's present tense currently
 *                  outruns the default). Promoting a claim from `pending` to
 *                  shipped MUST replace the marker with an `assert`/`enforcedBy`,
 *                  so the honesty-debt cannot be paid down in prose alone.
 *
 * When a default regresses (e.g. telemetry stops defaulting to `off`), the
 * matching `assert` fails the build — the cybernetic "sense the gap, correct"
 * loop from "Hand on the Tiller", applied to the project's own claims.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SECURITY_LEVEL } from '@xnetjs/crypto'
import { createDID, isValidDID } from '@xnetjs/identity'
import { CURRENT_PROTOCOL_VERSION, verifyChange, verifyChangeHash } from '@xnetjs/sync'
import { DEFAULT_CONSENT } from '@xnetjs/telemetry'
import { describe, expect, it } from 'vitest'

/** Repo root, derived from this file's location (tests/integration/src/x). */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

type Backing = 'enforced' | 'architectural' | 'building'

interface Claim {
  /** Stable id — also the anchor a future PR flips from pending to shipped. */
  id: string
  /** Where the public, present-tense promise is made. */
  source: string
  /** How the Charter classifies it (mirrors commitments.ts). */
  backing: Backing
  /** An executable check of a shipped code fact. */
  assert?: () => void
  /** Repo-relative path to the regression test that already guards this claim. */
  enforcedBy?: string
  /** A disclosed gap: the promise is not yet the default. Reason is required. */
  pending?: string
}

const CLAIMS: Claim[] = [
  {
    id: 'consent-off-by-default',
    source: 'the-forest-and-the-field · Charter §Consent — "telemetry is off by default"',
    backing: 'enforced',
    assert: () => expect(DEFAULT_CONSENT.tier).toBe('off')
  },
  {
    id: 'consent-autoscrub-on',
    source: 'Charter §Consent — "what is sent is scrubbed and bucketed"',
    backing: 'enforced',
    assert: () => expect(DEFAULT_CONSENT.autoScrub).toBe(true)
  },
  {
    id: 'exit-portable-did-key',
    source: 'the-loom-you-can-read §3 · Charter §Exit — "a did:key you mint, nothing can revoke"',
    backing: 'architectural',
    assert: () => {
      const did = createDID(new Uint8Array(32))
      expect(did.startsWith('did:key:z')).toBe(true)
      expect(isValidDID(did)).toBe(true)
      // A name nobody issues you: a non-key DID method is not a valid xNet identity.
      expect(isValidDID('did:web:example.com')).toBe(false)
    }
  },
  {
    id: 'loom-hub-cannot-forge',
    source: 'the-loom-you-can-read §5 — "the hub can\'t forge an edit or rewrite your history"',
    backing: 'architectural',
    assert: () => {
      // The verify path a hub/peer runs before accepting a change must be present
      // and wired; its byte-level behaviour is proven in packages/sync/change.test.ts.
      expect(typeof verifyChange).toBe('function')
      expect(typeof verifyChangeHash).toBe('function')
    }
  },
  {
    id: 'pq-posture-declared',
    source:
      'change.ts CURRENT_PROTOCOL_VERSION=4 — hybrid Ed25519+ML-DSA (code ahead of the essays)',
    backing: 'architectural',
    assert: () => {
      // The protocol declares the hybrid capability; the shipped default
      // security level is a deliberate choice. This documents the intentional
      // gap so flipping the default becomes a visible, reviewed change. v4
      // added the grinding-resistant LWW tiebreak (exploration 0305).
      expect(CURRENT_PROTOCOL_VERSION).toBe(4)
      expect([0, 1, 2]).toContain(DEFAULT_SECURITY_LEVEL)
    }
  },
  {
    id: 'calm-feeds-chronological',
    source:
      'the-gentlest-furnace · Charter §Calm — "feeds are chronological, no engagement ranking"',
    backing: 'enforced',
    enforcedBy: 'packages/social/src/feeds/charter-calm-feeds.test.ts'
  },
  {
    id: 'calm-notifications-rule-based',
    source: 'Charter §Calm — "notifications are rule-based" (content-independent priority)',
    backing: 'enforced',
    enforcedBy: 'packages/comms/src/notify/charter-calm-rules.test.ts'
  },
  {
    id: 'loom-hub-blind-e2e',
    source: 'the-loom-you-can-read §5 — "on the encrypted path it can\'t even read your content"',
    backing: 'building',
    pending:
      'End-to-end encryption (packages/crypto/src/envelope.ts: XChaCha20-Poly1305 + per-recipient ' +
      'X25519 wrap + rotation revoke) is built and tested but NOT wired into the sync path — the ' +
      'hub stores/reads plaintext properties by default. Ship: 0257 Tier 0 (per-Space "sealed" toggle).'
  },
  {
    id: 'agency-run-it-yourself',
    source: 'the-right-to-say-no — "AI you point at your own data, and can run yourself"',
    backing: 'building',
    pending:
      'The WebLLM in-tab provider (packages/plugins/src/ai/connectors/webllm-provider.ts) is built ' +
      'but excluded from USABLE_TIERS — detectable, not instantiable. In-browser local models are ' +
      'not yet selectable. Ship: exploration 0252 / 0257 Tier 1 (engine-injection path).'
  },
  {
    id: 'commons-no-ground-rent-export',
    source:
      'Charter §Commons/No ground rent — "no egress or export fees: export everything, verified, for free" (0351)',
    backing: 'enforced',
    enforcedBy: 'packages/data/src/portability/portability.test.ts'
  },
  {
    id: 'commons-no-ground-rent-agent-audit',
    source:
      'Charter §Commons/No ground rent — an agent audit receipt exports free and verifies ' +
      'offline, with no hub, account, or network (0416). Charging for the passport, the ' +
      'signature, the ability to verify, or the export would be rent on your own record.',
    backing: 'enforced',
    enforcedBy: 'packages/data/src/agent-audit/agent-audit.test.ts'
  },
  {
    id: 'commons-storage-is-an-improvement-charge',
    source:
      'Charter §Commons/No ground rent — storage add-ons bill the operation we run (bytes ' +
      'rented from an object store, replicated and backed up), never access to data you ' +
      'would own anyway (0435, ADR-33). The pack is per TENANT, so it can never become a ' +
      'per-member meter through the storage door; and it is additive over the plan base, ' +
      'so a plan change re-derives the quota instead of silently shrinking what was bought.',
    backing: 'enforced',
    enforcedBy: 'packages/entitlements/src/plans.test.ts'
  },
  {
    id: 'commons-no-per-member-pricing',
    source:
      'Charter §Commons/No ground rent — "no per-member pricing on communities: hosting is ' +
      'billed on the operations we run, never on the size of the audience you brought" (0359)',
    backing: 'enforced',
    enforcedBy: 'packages/entitlements/src/plans.test.ts'
  },
  {
    id: 'commons-no-rent-on-introductions',
    source:
      'Charter §Commons/No ground rent — "no rent on introductions: the people-matching layer ' +
      'never sells the introduction — no boost, no paid rank, no pay-to-reveal" (0417)',
    backing: 'enforced',
    assert: () => {
      // The enforcer is the humane-patterns CI gate, not a package test, so the
      // receipt reads the gate's source and pins the rule plus the meter
      // identifiers it must keep banning. Renaming or dropping any of them is a
      // visible, reviewed change here — the meter cannot slip back in quietly.
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-humane-patterns.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'the metered-connection rule must exist').toContain("name: 'metered connection'")
      for (const token of ['boostPrice', 'paidVisibility', 'featuredProfile', 'payToReveal']) {
        expect(gate, `metered-connection rule must ban ${token}`).toContain(token)
      }
    }
  },
  {
    id: 'agency-capabilities-are-visible',
    source:
      'Charter §Agency/You can see what you are able to do — "a capability you cannot see is ' +
      'not a degree of freedom you have"; every user-flippable capability is declared with a ' +
      "surface, or a written reason it is internal (0428, after Cate Hall's two-term " +
      'definition of agency: see AND act)',
    backing: 'enforced',
    assert: () => {
      // The enforcer is a CI gate rather than a package test, so the receipt
      // reads the gate's source and pins the three rules it must keep applying.
      // Weakening any of them is then a visible, reviewed change here.
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-capability-surface.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'the gate must scan for experiment flags').toContain('xnet:experiment:')
      expect(gate, 'a null surface must require a written reason').toContain('hidden')
      expect(gate, 'flags named only in comments must not count as capabilities').toContain(
        'stripComments'
      )

      // The receipt that matters is the register itself: the AI assist mode —
      // the capability whose absence from every UI is what prompted 0428 — is
      // declared and carries a surface a person can actually reach.
      const register = readFileSync(
        fileURLToPath(new URL('apps/web/src/lib/capabilities.ts', `file://${repoRoot}`)),
        'utf8'
      )
      expect(register, 'the assist mode must be declared').toContain('AI_ASSIST_MODE_KEY')
      expect(register, 'the assist mode must have a settings surface').toContain(
        "{ kind: 'settings', section: 'ai' }"
      )
    }
  },
  {
    id: 'calm-no-manufactured-urgency',
    source:
      'Charter §Calm — "we do not manufacture urgency": no scarcity counters, countdown ' +
      'pressure or act-now prompts. The copy rule was already written in ' +
      'apps/cloud/src/billing/notify.ts and enforced by nothing (0429)',
    backing: 'enforced',
    assert: () => {
      // Same shape as the metered-connection receipt above: the enforcer is the
      // humane-patterns gate, so pin the rule and the urgency identifiers it must
      // keep banning. The negative half matters just as much — a rule that also
      // fired on `expiresIn` would be a gate nobody can keep green, so the
      // legitimate time-handling names must stay OUT of the pattern.
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-humane-patterns.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'the manufactured-urgency rule must exist').toContain(
        "name: 'manufactured urgency'"
      )
      const rule = gate.slice(gate.indexOf("name: 'manufactured urgency'"))
      const pattern = rule.slice(0, rule.indexOf('\n', rule.indexOf('re:')))
      for (const token of ['spotsLeft', 'seatsRemaining', 'offerEndsAt', 'actNow']) {
        expect(pattern, `manufactured-urgency rule must ban ${token}`).toContain(token)
      }
      for (const legitimate of ['expiresIn', 'expiresAt', 'dueDate']) {
        expect(pattern, `manufactured-urgency rule must NOT fire on ${legitimate}`).not.toContain(
          legitimate
        )
      }
    }
  },
  {
    id: 'commons-no-scored-intimacy',
    source:
      'Charter §Commons/No ground rent — "no scored intimacy: relationships are made legible, ' +
      'never scored — no health score, no ranking, no neglect list" (0422)',
    backing: 'enforced',
    assert: () => {
      // Same shape as the metered-connection receipt: the enforcer is the CI
      // gate, so the receipt pins the rule name and the scoring identifiers it
      // must keep banning. It also pins the `surplus` group — demoting the rule
      // to `dark-pattern` would silently narrow it to UI files and stop it
      // seeing the derivation in @xnetjs/crm, which is the whole point.
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-humane-patterns.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'the scored-intimacy rule must exist').toContain("name: 'scored intimacy'")
      const rule = gate.slice(gate.indexOf("name: 'scored intimacy'"))
      expect(
        rule.slice(0, 200),
        'scored intimacy must stay in the all-packages surplus scope'
      ).toContain("group: 'surplus'")
      for (const token of [
        'relationshipScore',
        'friendshipScore',
        'intimacyScore',
        'connectionHealth',
        'neglectedContacts'
      ]) {
        expect(gate, `scored-intimacy rule must ban ${token}`).toContain(token)
      }
    }
  },
  {
    id: 'economics-anchor-tenancy-parity',
    source:
      'Charter §Commons/No ground rent + ECONOMICS.md §5 — "xNet Cloud runs the same hub ' +
      'anyone else can run"; no Cloud-only hub fork, images pinned to immutable tags (0358)',
    backing: 'architectural',
    enforcedBy: 'scripts/check-cloud-boundary.sh'
  },
  {
    id: 'economics-no-context-capture',
    source:
      'Charter §Commons/No ground rent — "portability covers the context, not just the bytes: ' +
      'an audience, share grants, and plugin licences travel with the export" (0358)',
    backing: 'building',
    pending:
      'The signed change log, blobs and Yjs docs travel in a .xnetpack, but share links and ' +
      'grants are hub-managed (packages/hub/src/storage/, schemas/auth-exempt.ts) and do NOT, ' +
      'and the DID-based subscriber list is unbuilt. Portable bytes, partly captive context — ' +
      'the inventory is disclosed in docs/ECONOMICS.md §3. Ship: exploration 0234 Wave 3.'
  },
  {
    id: 'economics-refusals-are-affordable',
    source:
      'Charter §Commons/No ground rent test 5 (the Rust test) + ECONOMICS.md §4a — "every ' +
      'refusal must name at least one shipped or building lane that survives it" (0429)',
    backing: 'building',
    pending:
      'Thirteen of the fourteen §6 refusals map to a lane that pays for them (hosting carries 9, ' +
      'support 2, the marketplace 1, all-lanes 1). "No context capture" maps to NONE: ' +
      'ECONOMICS.md §6 calls it the most expensive decision in the Charter, and the ' +
      'compensating slopes — operated trust and multiplayer — are weaker per unit than a ' +
      'captive graph, with multiplayer not yet revenue-bearing. The refusal stands and is ' +
      'labelled on borrowed time in docs/ECONOMICS.md §4a. Dropping it needs its own ADR; ' +
      'the Rust test does not authorise it. Ship: a revenue-bearing multiplayer lane.'
  },
  {
    id: 'floor-old-hardware-keeps-working',
    source:
      'Charter §7 Floor — "we declare a minimum supported device, we publish what the app ' +
      'costs to run there, and CI fails a change that raises it"; manufacturing is ~70-90% of ' +
      "a device's lifetime emissions, so obsoleting hardware is the harm (0434)",
    backing: 'enforced',
    assert: () => {
      // A floor nobody wrote down is a system requirement, not a commitment.
      // Assert the declaration exists and names the three things that make it
      // answerable: the machine, its RAM, and the oldest OS we support.
      const baseline = JSON.parse(
        readFileSync(
          fileURLToPath(new URL('footprint-baseline.json', `file://${repoRoot}`)),
          'utf8'
        )
      )
      expect(baseline.floor?.description, 'the floor device must be declared').toBeTruthy()
      expect(baseline.floor?.ram_gb, 'the floor must name a RAM figure').toBeGreaterThan(0)
      expect(Object.keys(baseline.floor?.os ?? {}).length, 'the floor must name OS floors').toBe(3)

      // The receipt that can actually fail a build: a committed byte budget.
      const bytes = baseline.metrics?.['web.initial-bytes-gzip']
      expect(typeof bytes?.value, 'the byte budget must be a committed number').toBe('number')

      // The weaker half must stay labelled as weaker. Cold-open and RSS are
      // hand-measured on hardware no runner has, so each must either carry a
      // date or say `pending` — never a bare number that reads like the byte
      // budget's equal while having been measured somewhere else entirely.
      for (const id of ['floor.cold-open-ms', 'floor.peak-rss-mb']) {
        const metric = baseline.metrics?.[id]
        expect(
          metric?.status === 'pending' || typeof metric?.measuredAt === 'string',
          `${id} must be dated or disclosed as pending`
        ).toBe(true)
      }

      // The enforcer is a CI gate, so pin the branch that makes green mean
      // something: a metric that stops being measurable must fail rather than
      // pass. Deleting it would leave a gate that cannot tell a lean app from
      // a broken measurement.
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-footprint-budget.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'an unmeasurable metric must fail, not pass').toContain("kind: 'unmeasured'")
      expect(gate, 'the budget must ratchet against the baseline').toContain('footprint-baseline')
      expect(gate, 'the gate must carry its own negative control').toContain('--selftest')

      // And the promise itself. §7 is the only Charter section that could be
      // softened to an aspiration without any code changing, so the receipt
      // reads the prose too: the section must exist and must still claim to be
      // enforced. Downgrading it becomes a visible, reviewed edit here.
      const charter = readFileSync(
        fileURLToPath(new URL('docs/CHARTER.md', `file://${repoRoot}`)),
        'utf8'
      )
      expect(charter, 'Charter §7 must exist').toContain('## 7. Floor')
      const section = charter.slice(charter.indexOf('## 7. Floor'))
      expect(
        section.slice(0, section.indexOf('\n---')),
        '§7 must keep an Enforced claim'
      ).toContain('**Enforced:**')
      expect(charter, '§7 must refuse the carbon claim in writing').toContain(
        'We make no carbon claim'
      )
    }
  },
  {
    id: 'floor-no-sustainability-upcharge',
    source:
      'Charter §6/No ground rent + §7 — "efficiency is not a tier": no green/carbon-neutral ' +
      'SKU, and no claim that xNet is greener than an alternative. A margin on a clean tier ' +
      'is a standing reason to keep the default one dirty (0434)',
    backing: 'enforced',
    assert: () => {
      const gate = readFileSync(
        fileURLToPath(new URL('scripts/check-humane-patterns.mjs', `file://${repoRoot}`)),
        'utf8'
      )
      expect(gate, 'the green-claim rule must exist').toContain("name: 'unbacked green claim'")
      const rule = gate.slice(gate.indexOf("name: 'unbacked green claim'"))
      const pattern = rule.slice(0, rule.indexOf('\n', rule.indexOf('re:')))
      for (const token of ['carbonNeutral', 'co2Saved', 'greenTier', 'ecoBadge']) {
        expect(pattern, `green-claim rule must ban ${token}`).toContain(token)
      }
      // The negative half: measuring energy is honest work and may become
      // useful for scheduling. A rule that also fired on the physics would be
      // a rule that bans the only defensible version of this.
      for (const legitimate of ['carbonIntensity', 'energyUsage', 'gridRegion']) {
        expect(pattern, `green-claim rule must NOT fire on ${legitimate}`).not.toContain(legitimate)
      }
    }
  },
  {
    id: 'governance-rule-change-path',
    source:
      'GOVERNANCE.md — "the right to be heard, on the record" · Charter §6 — the refused rents ' +
      'are an in-scope rule anyone affected can propose changing (0361)',
    backing: 'architectural',
    assert: () => {
      // Ostrom principle 3 needs a *path*, not a vote — so the receipt is that
      // the path and its record both exist. A governance promise whose decision
      // log can be quietly deleted is exit-with-extra-steps, which is the exact
      // posture 0361 set out to fix.
      const required = [
        'docs/RULE_CHANGES.md',
        'docs/decisions/rule-changes.md',
        '.github/ISSUE_TEMPLATE/rule-change.yml'
      ]
      for (const rel of required) {
        const abs = fileURLToPath(new URL(rel, `file://${repoRoot}`))
        expect(existsSync(abs), `missing rule-change surface: ${rel}`).toBe(true)
      }

      // A log of only the accepted proposals is marketing. Assert the record
      // actually carries a refusal, so the honesty cannot be edited out.
      const log = readFileSync(
        fileURLToPath(new URL('docs/decisions/rule-changes.md', `file://${repoRoot}`)),
        'utf8'
      )
      expect(log, 'decision log must record at least one declined proposal').toMatch(
        /\*\*Declined\*\*/
      )
    }
  },
  {
    id: 'exit-reimport-roundtrip',
    source: 'the-right-to-say-no — "leave with everything" (a door that swings both ways)',
    backing: 'building',
    pending:
      'Workspace export ships (apps/web/src/lib/browser-export.ts) and the bundle format is ' +
      'documented, but there is no re-import UI yet. The door opens outward, not back in. ' +
      'Ship: 0257 Tier 2 (re-import UI).'
  }
]

describe('Charter claims <-> code conformance ledger (0257)', () => {
  it('every claim declares exactly one backing (assert | enforcedBy | pending)', () => {
    for (const claim of CLAIMS) {
      const declared = [claim.assert, claim.enforcedBy, claim.pending].filter(
        (x) => x !== undefined
      )
      expect(
        declared.length,
        `claim "${claim.id}" must declare exactly one of assert/enforcedBy/pending`
      ).toBe(1)
    }
  })

  it('every enforcedBy points at a regression test that still exists', () => {
    for (const claim of CLAIMS) {
      if (!claim.enforcedBy) continue
      const abs = fileURLToPath(new URL(claim.enforcedBy, `file://${repoRoot}`))
      expect(existsSync(abs), `${claim.id}: missing enforcer ${claim.enforcedBy}`).toBe(true)
    }
  })

  it('discloses the pending honesty-debt (essay present tense ahead of the default)', () => {
    const pending = CLAIMS.filter((c) => c.pending)
    // Not a failure — a manifest. When a pending claim ships, its marker is
    // replaced by an assert/enforcedBy and it drops off this list.
    for (const claim of pending) {
      // eslint-disable-next-line no-console
      console.log(`  pending: ${claim.id} — ${claim.pending}`)
    }
    expect(pending.every((c) => typeof c.pending === 'string' && c.pending.length > 0)).toBe(true)
  })

  for (const claim of CLAIMS) {
    if (!claim.assert) continue
    it(`[${claim.backing}] ${claim.id} — ${claim.source}`, claim.assert)
  }
})
