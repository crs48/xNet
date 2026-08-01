import type { AgentAuditBundle, BundleAction, BundleApproval } from './types'
import { generateIdentity, mintAgentPassport } from '@xnetjs/identity'
import { createUnsignedChange, signChange, type Change, type UnsignedChange } from '@xnetjs/sync'
import { describe, expect, it } from 'vitest'
import {
  buildAgentAuditBundle,
  parseAgentAuditBundle,
  serializeAgentAuditBundle,
  type AgentAuditSource
} from './build'
import { verifyAgentAudit } from './verify'

const operator = generateIdentity()

const CAPS = [{ with: 'xnet://space/inbox', can: 'node/create' }]

/** Mint a passport and sign `count` chained changes under the agent's key. */
function scenario(count = 2) {
  const grant = mintAgentPassport({
    operatorDID: operator.identity.did,
    operatorKey: operator.privateKey,
    capabilities: CAPS
  })

  const changes: Change[] = []
  let parentHash: Change['parentHash'] = null
  for (let i = 0; i < count; i += 1) {
    const unsigned: UnsignedChange<Record<string, unknown>> = createUnsignedChange({
      id: `change-${i}`,
      type: 'update-item',
      payload: { field: 'status', value: `v${i}` },
      parentHash,
      authorDID: grant.agentDID as `did:key:${string}`,
      lamport: i + 1
    })
    const signed: Change = signChange(unsigned, grant.agentKey)
    changes.push(signed)
    parentHash = signed.hash
  }

  return { grant, changes }
}

const action = (over: Partial<BundleAction> = {}): BundleAction => ({
  id: 'action-1',
  session: 'session-1',
  tool: 'xnet_update',
  risk: 'low',
  status: 'applied',
  reversibility: 'reversible',
  changeIds: ['change-0'],
  ...over
})

const approval = (over: Partial<BundleApproval> = {}): BundleApproval => ({
  id: 'approval-1',
  actionId: 'action-1',
  surface: 'app',
  decision: 'approved',
  approverDID: operator.identity.did,
  ...over
})

function bundleOf(
  grant: ReturnType<typeof scenario>['grant'],
  changes: Change[],
  actions: BundleAction[],
  approvals: BundleApproval[] = []
): AgentAuditBundle {
  return {
    version: 1,
    exportedAt: 1_700_000_000_000,
    passport: {
      agentDID: grant.agentDID,
      operatorDID: operator.identity.did,
      ucan: grant.ucan,
      expiresAt: grant.expiresAt
    },
    actions,
    approvals,
    changes
  }
}

describe('agent audit bundle — build (exploration 0416)', () => {
  it('assembles actions, approvals, and the changes they reference', async () => {
    const { grant, changes } = scenario(2)
    const source: AgentAuditSource = {
      listActions: () => [
        action({ changeIds: ['change-0'] }),
        action({ id: 'action-2', changeIds: ['change-1'] })
      ],
      listApprovals: (ids) => ids.map((id) => approval({ id: `approval-${id}`, actionId: id })),
      getChanges: (ids) => changes.filter((c) => ids.includes(c.id))
    }

    const bundle = await buildAgentAuditBundle({
      passport: {
        agentDID: grant.agentDID,
        operatorDID: operator.identity.did,
        ucan: grant.ucan
      },
      source,
      now: () => 1_700_000_000_000
    })

    expect(bundle.actions).toHaveLength(2)
    expect(bundle.changes).toHaveLength(2)
    expect(bundle.exportedAt).toBe(1_700_000_000_000)
  })

  it('deduplicates change ids referenced by more than one action', async () => {
    const { grant, changes } = scenario(1)
    const seen: string[][] = []
    const source: AgentAuditSource = {
      listActions: () => [action(), action({ id: 'action-2' })], // both cite change-0
      listApprovals: () => [],
      getChanges: (ids) => {
        seen.push(ids)
        return changes.filter((c) => ids.includes(c.id))
      }
    }

    await buildAgentAuditBundle({
      passport: { agentDID: grant.agentDID, operatorDID: operator.identity.did, ucan: grant.ucan },
      source
    })

    expect(seen[0]).toEqual(['change-0'])
  })

  it('round-trips through serialize/parse with signatures intact', async () => {
    const { grant, changes } = scenario(2)
    const original = bundleOf(grant, changes, [action()])

    const parsed = parseAgentAuditBundle(serializeAgentAuditBundle(original))

    expect(parsed.changes[0].signature).toBeInstanceOf(Uint8Array)
    expect(Array.from(parsed.changes[0].signature)).toEqual(Array.from(changes[0].signature))
    expect(verifyAgentAudit(parsed).ok).toBe(true)
  })

  it('refuses an unreadable bundle rather than returning an empty one', () => {
    expect(() => parseAgentAuditBundle(JSON.stringify({ version: 99 }))).toThrow(/version/)
    expect(() => parseAgentAuditBundle(JSON.stringify({ version: 1 }))).toThrow(/passport/)
  })
})

describe('agent audit bundle — verify (exploration 0416)', () => {
  it('passes a clean bundle', () => {
    const { grant, changes } = scenario(2)
    const report = verifyAgentAudit(bundleOf(grant, changes, [action()]))

    expect(report.ok).toBe(true)
    expect(report.problems).toEqual([])
    expect(report.checked.changes).toBe(2)
  })

  it('fails loudly when a change is tampered with', () => {
    const { grant, changes } = scenario(2)
    const tampered = structuredClone(changes)
    tampered[0].payload = { field: 'status', value: 'tampered' }

    const report = verifyAgentAudit(bundleOf(grant, tampered, [action()]))

    expect(report.ok).toBe(false)
    expect(report.problems.map((p) => p.code)).toContain('change-hash-tampered')
    expect(report.problems[0].subject).toBe('change-0')
  })

  it('detects a removed action via the broken chain — not just per-change checks', () => {
    const { grant, changes } = scenario(3)
    // Every remaining change is individually valid; only the chain reveals it.
    const withHole = [changes[0], changes[2]]

    const report = verifyAgentAudit(bundleOf(grant, withHole, [action()]))

    expect(report.ok).toBe(false)
    const chainProblem = report.problems.find((p) => p.code === 'chain-broken')
    expect(chainProblem?.message).toMatch(/may have been removed/)
  })

  it('rejects a change authored by anyone but the passport agent', () => {
    const { grant, changes } = scenario(1)
    const impostor = generateIdentity()
    const forged = signChange(
      createUnsignedChange({
        id: 'change-x',
        type: 'update-item',
        payload: {},
        parentHash: changes[0].hash,
        authorDID: impostor.identity.did,
        lamport: 2
      }),
      impostor.privateKey
    )

    const report = verifyAgentAudit(bundleOf(grant, [...changes, forged], [action()]))

    expect(report.problems.map((p) => p.code)).toContain('change-wrong-author')
  })

  it('rejects a high-risk action approved by the agent instead of the operator', () => {
    const { grant, changes } = scenario(1)
    const selfApproved = approval({ approverDID: grant.agentDID })

    const report = verifyAgentAudit(
      bundleOf(grant, changes, [action({ risk: 'high' })], [selfApproved])
    )

    expect(report.ok).toBe(false)
    expect(report.problems.map((p) => p.code)).toContain('approval-not-operator-signed')
    expect(report.checked.gatedActions).toBe(1)
  })

  it('rejects a high-risk action released from chat, whatever DID it names', () => {
    const { grant, changes } = scenario(1)
    const chatApproval = approval({ surface: 'chat' })

    const report = verifyAgentAudit(
      bundleOf(grant, changes, [action({ risk: 'critical' })], [chatApproval])
    )

    expect(report.problems.map((p) => p.code)).toContain('approval-not-operator-signed')
  })

  it('rejects a high-risk action with no approval at all', () => {
    const { grant, changes } = scenario(1)
    const report = verifyAgentAudit(bundleOf(grant, changes, [action({ risk: 'high' })]))
    expect(report.problems.map((p) => p.code)).toContain('approval-missing')
  })

  it('accepts a high-risk action approved by the operator in the app', () => {
    const { grant, changes } = scenario(1)
    const report = verifyAgentAudit(
      bundleOf(grant, changes, [action({ risk: 'high' })], [approval()])
    )
    expect(report.ok).toBe(true)
    expect(report.checked.gatedActions).toBe(1)
  })

  it('does not gate low and medium actions on an operator signature', () => {
    const { grant, changes } = scenario(1)
    const report = verifyAgentAudit(bundleOf(grant, changes, [action({ risk: 'medium' })]))
    expect(report.ok).toBe(true)
    expect(report.checked.gatedActions).toBe(0)
  })

  it('flags an action referencing a change absent from the bundle', () => {
    const { grant, changes } = scenario(1)
    const report = verifyAgentAudit(
      bundleOf(grant, changes, [action({ changeIds: ['change-0', 'change-missing'] })])
    )
    expect(report.problems.map((p) => p.code)).toContain('change-missing')
  })

  it('rejects a passport that names a different operator', () => {
    const { grant, changes } = scenario(1)
    const stranger = generateIdentity()
    const bundle = bundleOf(grant, changes, [action()])
    bundle.passport.operatorDID = stranger.identity.did

    const report = verifyAgentAudit(bundle)

    expect(report.ok).toBe(false)
    expect(report.problems.map((p) => p.code)).toContain('passport-invalid')
  })

  it('treats revocation as a current statement, not a historical one', () => {
    const { grant, changes } = scenario(1)
    const bundle = bundleOf(grant, changes, [action()])
    const revoked = { isRevoked: () => true }

    // Default: a receipt for actions taken while the passport was live stays valid.
    expect(verifyAgentAudit(bundle, { revocations: revoked }).ok).toBe(true)
    // Opt in when the question is "is this agent still trusted?".
    expect(verifyAgentAudit(bundle, { revocations: revoked, failOnRevoked: true }).ok).toBe(false)
  })
})
