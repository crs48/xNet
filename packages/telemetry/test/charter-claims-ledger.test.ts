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
import { existsSync } from 'node:fs'
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
