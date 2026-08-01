import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  serializeAgentAuditBundle,
  type AgentAuditBundle,
  type BundleAction,
  type BundleApproval
} from '@xnetjs/data'
import { generateIdentity, mintAgentPassport } from '@xnetjs/identity'
import { createUnsignedChange, signChange, type Change, type UnsignedChange } from '@xnetjs/sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAuditVerify } from '../commands/audit.js'

const operator = generateIdentity()
let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xnet-audit-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function makeBundle(over: { risk?: BundleAction['risk']; approval?: BundleApproval | null } = {}) {
  const grant = mintAgentPassport({
    operatorDID: operator.identity.did,
    operatorKey: operator.privateKey,
    capabilities: [{ with: 'xnet://space/inbox', can: 'node/create' }]
  })

  const unsigned: UnsignedChange<Record<string, unknown>> = createUnsignedChange({
    id: 'change-0',
    type: 'update-item',
    payload: { field: 'status', value: 'done' },
    parentHash: null,
    authorDID: grant.agentDID as `did:key:${string}`,
    lamport: 1
  })
  const change: Change = signChange(unsigned, grant.agentKey)

  const action: BundleAction = {
    id: 'action-1',
    session: 'session-1',
    tool: 'xnet_update',
    risk: over.risk ?? 'low',
    status: 'applied',
    reversibility: 'reversible',
    changeIds: ['change-0']
  }

  const approvals = over.approval === null || over.approval === undefined ? [] : [over.approval]

  const bundle: AgentAuditBundle = {
    version: 1,
    exportedAt: 1_700_000_000_000,
    passport: {
      agentDID: grant.agentDID,
      operatorDID: operator.identity.did,
      ucan: grant.ucan
    },
    actions: [action],
    approvals,
    changes: [change]
  }
  return { bundle, grant }
}

async function writeBundle(name: string, bundle: AgentAuditBundle): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, serializeAgentAuditBundle(bundle), 'utf8')
  return path
}

describe('xnet audit verify (exploration 0416)', () => {
  it('verifies a clean bundle from disk', async () => {
    const { bundle } = makeBundle()
    const report = await runAuditVerify(await writeBundle('clean.json', bundle))

    expect(report.ok).toBe(true)
    expect(report.checked.changes).toBe(1)
  })

  it('fails on a bundle whose approval is signed by the agent, not the operator', async () => {
    const { bundle } = makeBundle({ risk: 'high' })
    // The agent signs its own release — exactly what the ceremony forbids.
    bundle.approvals = [
      {
        id: 'approval-1',
        actionId: 'action-1',
        surface: 'app',
        decision: 'approved',
        approverDID: bundle.passport.agentDID
      }
    ]

    const report = await runAuditVerify(await writeBundle('self-approved.json', bundle))

    expect(report.ok).toBe(false)
    expect(report.problems.map((p) => p.code)).toContain('approval-not-operator-signed')
  })

  it('fails on a tampered change', async () => {
    const { bundle } = makeBundle()
    bundle.changes[0].payload = { field: 'status', value: 'tampered' }

    const report = await runAuditVerify(await writeBundle('tampered.json', bundle))

    expect(report.ok).toBe(false)
    expect(report.problems.map((p) => p.code)).toContain('change-hash-tampered')
  })

  it('throws rather than reporting a clean run when the file is unreadable', async () => {
    await expect(runAuditVerify(join(dir, 'nope.json'))).rejects.toThrow(/Cannot read bundle/)
  })

  it('throws rather than reporting a clean run when the file is not a bundle', async () => {
    const path = join(dir, 'garbage.json')
    await writeFile(path, JSON.stringify({ hello: 'world' }), 'utf8')
    await expect(runAuditVerify(path)).rejects.toThrow(/version/)
  })
})
