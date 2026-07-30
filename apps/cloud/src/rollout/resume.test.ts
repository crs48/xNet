/**
 * G3 regression suite (exploration 0411).
 *
 * The bug: `rollWave` kept `promoted` / `rolledBack` in local `const` arrays, so
 * a control-plane restart mid-rollout left the fleet split-version with no
 * record of which tenants were upgraded and no captured `priorVersion` to roll
 * back to.
 */

import { describe, expect, it } from 'vitest'
import { InMemoryDocStore } from '../stores/durable'
import { rollWave, runRollout, type RolloutEngineDeps, type RolloutPlan } from './engine'
import { loadOrStart, priorVersionOf, startRun, waveResultFor, type RolloutRun } from './run-record'

/** Deps that record every upgrade and can be made to die at a chosen tenant. */
function fakeDeps(
  availability: Record<string, number>,
  opts: { dieOn?: string; initialVersion?: string } = {}
) {
  const upgrades: { tenantId: string; target: string }[] = []
  const versions: Record<string, string> = {}
  const deps: RolloutEngineDeps = {
    async upgrade(tenantId, target) {
      if (opts.dieOn === tenantId) throw new Error(`process died at ${tenantId}`)
      upgrades.push({ tenantId, target })
      versions[tenantId] = target
    },
    async priorVersion(tenantId) {
      return versions[tenantId] ?? opts.initialVersion ?? 'v0'
    },
    async measure(tenantId) {
      return availability[tenantId] ?? 1
    }
  }
  return { deps, upgrades, versions }
}

const OPTS = { target: 'v2', minAvailability: 0.99 }

describe('G3 — rollWave checkpoints each tenant', () => {
  it('writes a checkpoint per tenant, in order', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const run = startRun('r1', 'v2')
    const { deps } = fakeDeps({})

    await rollWave(deps, ['a', 'b', 'c'], OPTS, {
      run,
      save: (r) => store.put('r1', r)
    })

    const saved = await store.get('r1')
    expect(saved?.checkpoints.map((c) => c.tenantId)).toEqual(['a', 'b', 'c'])
    expect(saved?.checkpoints.every((c) => c.outcome === 'promoted')).toBe(true)
  })

  it('captures priorVersion BEFORE the upgrade so rollback survives a restart', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({}, { initialVersion: 'v1' })

    await rollWave(deps, ['a'], OPTS, {
      run: startRun('r1', 'v2'),
      save: (r) => store.put('r1', r)
    })

    // After the upgrade the tenant IS on v2; only the checkpoint remembers v1.
    expect(priorVersionOf((await store.get('r1'))!, 'a')).toBe('v1')
  })

  it('records a rolled-back tenant as such', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({ b: 0.5 }, { initialVersion: 'v1' })

    const result = await rollWave(deps, ['a', 'b'], OPTS, {
      run: startRun('r1', 'v2'),
      save: (r) => store.put('r1', r)
    })

    expect(result).toEqual({ promoted: ['a'], rolledBack: ['b'] })
    const saved = await store.get('r1')
    expect(saved?.checkpoints.find((c) => c.tenantId === 'b')?.outcome).toBe('rolled-back')
  })

  it('RESUMES without re-upgrading already-decided tenants', async () => {
    const store = new InMemoryDocStore<RolloutRun>()

    // Pass 1: dies while upgrading 'c'.
    const first = fakeDeps({}, { dieOn: 'c' })
    await expect(
      rollWave(first.deps, ['a', 'b', 'c', 'd'], OPTS, {
        run: startRun('r1', 'v2'),
        save: (r) => store.put('r1', r)
      })
    ).rejects.toThrow(/process died/)

    expect(first.upgrades.map((u) => u.tenantId)).toEqual(['a', 'b'])
    expect((await store.get('r1'))?.checkpoints).toHaveLength(2)

    // Pass 2: a fresh process resumes from the stored run.
    const second = fakeDeps({})
    const resumed = await rollWave(second.deps, ['a', 'b', 'c', 'd'], OPTS, {
      run: (await store.get('r1'))!,
      save: (r) => store.put('r1', r)
    })

    // a and b are replayed from checkpoints, NOT re-upgraded.
    expect(second.upgrades.map((u) => u.tenantId)).toEqual(['c', 'd'])
    // ...but they still appear in the result, so the report is complete.
    expect(resumed.promoted).toEqual(['a', 'b', 'c', 'd'])
    expect((await store.get('r1'))?.checkpoints).toHaveLength(4)
  })

  it('behaves exactly as before when no durability is supplied', async () => {
    const { deps, upgrades } = fakeDeps({ b: 0.1 }, { initialVersion: 'v1' })
    const result = await rollWave(deps, ['a', 'b'], OPTS)
    expect(result).toEqual({ promoted: ['a'], rolledBack: ['b'] })
    // b upgraded to v2 then rolled back to v1.
    expect(upgrades.filter((u) => u.tenantId === 'b').map((u) => u.target)).toEqual(['v2', 'v1'])
  })
})

describe('G3 — runRollout resumes a killed rollout', () => {
  const plan: RolloutPlan = {
    target: 'v2',
    canary: ['canary-1'],
    waves: [['a', 'b'], ['c']],
    minAvailability: 0.99
  }
  const ship = { budgetPolicy: async () => 'ship' as const }

  it('marks a completed rollout complete', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({})

    const report = await runRollout(deps, plan, ship, { store, runId: 'v2' })
    expect(report.aborted).toBe(false)
    const saved = await store.get('v2')
    expect(saved?.status).toBe('complete')
    expect(saved?.checkpoints).toHaveLength(4) // canary + a + b + c
  })

  it('does not re-upgrade tenants decided before the restart', async () => {
    const store = new InMemoryDocStore<RolloutRun>()

    // Pass 1: dies partway through the first wave.
    const first = fakeDeps({}, { dieOn: 'b' })
    await expect(runRollout(first.deps, plan, ship, { store, runId: 'v2' })).rejects.toThrow(
      /process died/
    )
    expect(first.upgrades.map((u) => u.tenantId)).toEqual(['canary-1', 'a'])

    // Pass 2: same runId → resumes.
    const second = fakeDeps({})
    const report = await runRollout(second.deps, plan, ship, { store, runId: 'v2' })

    expect(second.upgrades.map((u) => u.tenantId)).toEqual(['b', 'c'])
    expect(report.aborted).toBe(false)
    expect(report.canary).toEqual({ promoted: ['canary-1'], rolledBack: [] })
    expect(report.waves).toEqual([
      { promoted: ['a', 'b'], rolledBack: [] },
      { promoted: ['c'], rolledBack: [] }
    ])
    expect((await store.get('v2'))?.status).toBe('complete')
  })

  it('records an abort reason rather than looking like a fresh run', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({ 'canary-1': 0.1 })

    const report = await runRollout(deps, plan, ship, { store, runId: 'v2' })
    expect(report.aborted).toBe(true)
    const saved = await store.get('v2')
    expect(saved?.status).toBe('aborted')
    expect(saved?.abortReason).toBe('canary regressed')
  })

  it('records a budget freeze as an abort', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({})
    const frozen = { budgetPolicy: async () => 'freeze' as const }

    await runRollout(deps, plan, frozen, { store, runId: 'v2' })
    expect((await store.get('v2'))?.status).toBe('aborted')
    expect((await store.get('v2'))?.abortReason).toBe('error-budget frozen')
  })

  it('tracks which wave was in progress', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    const { deps } = fakeDeps({}, { dieOn: 'c' })
    await runRollout(deps, plan, ship, { store, runId: 'v2' }).catch(() => undefined)
    expect((await store.get('v2'))?.waveIndex).toBe(1)
  })

  it('runs without durability exactly as before', async () => {
    const { deps } = fakeDeps({})
    const report = await runRollout(deps, plan, ship)
    expect(report.aborted).toBe(false)
    expect(report.waves).toHaveLength(2)
  })
})

describe('run-record helpers', () => {
  it('loadOrStart resumes a running record for the same target', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    await store.put('r1', {
      runId: 'r1',
      target: 'v2',
      waveIndex: 0,
      checkpoints: [{ tenantId: 'a', priorVersion: 'v1', outcome: 'promoted' }],
      status: 'running'
    })
    expect((await loadOrStart(store, 'r1', 'v2')).checkpoints).toHaveLength(1)
  })

  it('loadOrStart starts fresh for a different target or a finished run', async () => {
    const store = new InMemoryDocStore<RolloutRun>()
    await store.put('r1', {
      runId: 'r1',
      target: 'v2',
      waveIndex: 0,
      checkpoints: [{ tenantId: 'a', priorVersion: 'v1', outcome: 'promoted' }],
      status: 'complete'
    })
    expect((await loadOrStart(store, 'r1', 'v2')).checkpoints).toHaveLength(0)
    expect((await loadOrStart(store, 'r1', 'v3')).checkpoints).toHaveLength(0)
  })

  it('waveResultFor reads a wave outcome back out of the checkpoints', () => {
    const run: RolloutRun = {
      runId: 'r1',
      target: 'v2',
      waveIndex: 0,
      checkpoints: [
        { tenantId: 'a', priorVersion: 'v1', outcome: 'promoted' },
        { tenantId: 'b', priorVersion: 'v1', outcome: 'rolled-back' },
        { tenantId: 'z', priorVersion: 'v1', outcome: 'promoted' }
      ],
      status: 'running'
    }
    expect(waveResultFor(run, ['a', 'b'])).toEqual({ promoted: ['a'], rolledBack: ['b'] })
  })

  it('priorVersionOf returns null for an undecided tenant', () => {
    expect(priorVersionOf(startRun('r1', 'v2'), 'nope')).toBeNull()
  })
})
