/**
 * Tests for inter-plugin dependency resolution (exploration 0192).
 */

import { describe, it, expect } from 'vitest'
import {
  findMissingDependencies,
  resolveInstallOrder,
  DependencyCycleError,
  type DependencyNode
} from '../ecosystem/dependencies'

const base = '1.0.0'

describe('findMissingDependencies', () => {
  it('reports not-installed and version-mismatch reasons', () => {
    const target: DependencyNode = {
      id: 'com.me.app',
      version: base,
      dependencies: { 'com.me.core': '>=1.0.0', 'com.me.ui': '^2.0.0' }
    }
    const installed: DependencyNode[] = [{ id: 'com.me.ui', version: '1.5.0' }]
    const missing = findMissingDependencies(target, installed)
    expect(missing).toHaveLength(2)
    expect(missing.find((m) => m.required === 'com.me.core')?.reason).toBe('not-installed')
    const mismatch = missing.find((m) => m.required === 'com.me.ui')
    expect(mismatch?.reason).toBe('version-mismatch')
    expect(mismatch?.installedVersion).toBe('1.5.0')
  })

  it('is empty when all deps are satisfied', () => {
    const target: DependencyNode = {
      id: 'a',
      version: base,
      dependencies: { b: '>=1.0.0' }
    }
    expect(findMissingDependencies(target, [{ id: 'b', version: '1.2.0' }])).toEqual([])
  })

  it('treats a depless plugin as satisfiable', () => {
    expect(findMissingDependencies({ id: 'a', version: base }, [])).toEqual([])
  })
})

describe('resolveInstallOrder', () => {
  it('orders dependencies before dependents', () => {
    const nodes: DependencyNode[] = [
      { id: 'app', version: base, dependencies: { core: '*', ui: '*' } },
      { id: 'ui', version: base, dependencies: { core: '*' } },
      { id: 'core', version: base }
    ]
    const order = resolveInstallOrder(nodes)
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('ui'))
    expect(order.indexOf('ui')).toBeLessThan(order.indexOf('app'))
  })

  it('ignores edges to plugins outside the set', () => {
    const nodes: DependencyNode[] = [{ id: 'app', version: base, dependencies: { external: '*' } }]
    expect(resolveInstallOrder(nodes)).toEqual(['app'])
  })

  it('throws on a cycle', () => {
    const nodes: DependencyNode[] = [
      { id: 'a', version: base, dependencies: { b: '*' } },
      { id: 'b', version: base, dependencies: { a: '*' } }
    ]
    expect(() => resolveInstallOrder(nodes)).toThrow(DependencyCycleError)
  })
})
