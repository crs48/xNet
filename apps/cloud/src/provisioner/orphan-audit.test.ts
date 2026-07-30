import type { TenantRecord } from '../registry'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { findOrphans, formatOrphanReport } from './orphan-audit'

const record = (tenantId: string, substrateRef: string): TenantRecord => ({
  tenantId,
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: `u_${tenantId}`,
  did: '',
  hubUrl: `https://${tenantId}.hub.local`,
  substrateRef,
  region: 'local',
  targetVersion: 'v1',
  createdAt: 0,
  lastActiveMs: 0,
  dataTier: 'hot'
})

describe('findOrphans', () => {
  it('reports nothing when live services match records', () => {
    const report = findOrphans(
      [{ substrateRef: 'run://p0/a' }, { substrateRef: 'run://p0/b' }],
      [record('a', 'run://p0/a'), record('b', 'run://p0/b')]
    )
    expect(report.orphans).toEqual([])
    expect(report.danglingRecords).toEqual([])
    expect(formatOrphanReport(report)).toMatch(/^OK/)
  })

  it('flags a live service with no tenant record — the billable leak', () => {
    const report = findOrphans(
      [{ substrateRef: 'run://p0/a' }, { substrateRef: 'run://p0/ghost' }],
      [record('a', 'run://p0/a')]
    )
    expect(report.orphans.map((o) => o.substrateRef)).toEqual(['run://p0/ghost'])
    expect(formatOrphanReport(report)).toContain('ORPHANED')
  })

  it('flags a record whose hub is gone, separately from an orphan', () => {
    const report = findOrphans([], [record('a', 'run://p0/a')])
    expect(report.orphans).toEqual([])
    expect(report.danglingRecords).toEqual(['a'])
    expect(formatOrphanReport(report)).toContain('dangling')
  })

  it('reports both directions at once without collapsing them', () => {
    const report = findOrphans([{ substrateRef: 'run://p0/ghost' }], [record('a', 'run://p0/a')])
    expect(report.orphans).toHaveLength(1)
    expect(report.danglingRecords).toEqual(['a'])
    const line = formatOrphanReport(report)
    expect(line).toContain('ORPHANED')
    expect(line).toContain('dangling')
  })

  it('counts both sides for the summary', () => {
    const report = findOrphans(
      [{ substrateRef: 'run://p0/a' }, { substrateRef: 'run://p0/x' }],
      [record('a', 'run://p0/a')]
    )
    expect(report.liveCount).toBe(2)
    expect(report.recordCount).toBe(1)
  })
})
