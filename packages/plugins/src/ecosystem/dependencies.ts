/**
 * @xnetjs/plugins — inter-plugin dependencies (exploration 0192).
 *
 * A plugin may declare `dependencies: { '<pluginId>': '<versionRange>' }` in its
 * manifest. These helpers resolve a safe install order (topological sort),
 * detect cycles, and report missing/incompatible dependencies — the pure logic
 * an installer runs before activating a set of plugins.
 *
 * Kept structural (operates on a minimal `{ id, version, dependencies }` shape)
 * so it works for `XNetExtension` and `FeatureModule` alike.
 */

import { satisfiesRange } from './compatibility'

/** The minimal manifest shape the dependency resolver needs. */
export interface DependencyNode {
  id: string
  version: string
  dependencies?: Record<string, string>
}

/** A dependency that is absent or version-incompatible among installed plugins. */
export interface MissingDependency {
  /** The plugin that declares the requirement. */
  dependent: string
  /** The required plugin id. */
  required: string
  /** The required version range. */
  range: string
  /** Why it is unsatisfied. */
  reason: 'not-installed' | 'version-mismatch'
  /** The installed version, when present but mismatched. */
  installedVersion?: string
}

/** Index a list of plugins by id, last-wins. */
function indexById<T extends { id: string }>(nodes: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const n of nodes) map.set(n.id, n)
  return map
}

/**
 * Report dependencies of `target` that are not satisfied by `installed`.
 * Satisfied = a plugin with the required id is installed AND its version
 * satisfies the declared range.
 */
export function findMissingDependencies(
  target: DependencyNode,
  installed: readonly DependencyNode[]
): MissingDependency[] {
  const byId = indexById(installed)
  return Object.entries(target.dependencies ?? {})
    .map(([required, range]) => checkDependency(target.id, required, range, byId.get(required)))
    .filter((m): m is MissingDependency => m !== null)
}

/** Check one dependency edge; returns a {@link MissingDependency} or null if satisfied. */
function checkDependency(
  dependent: string,
  required: string,
  range: string,
  installed: DependencyNode | undefined
): MissingDependency | null {
  if (!installed) return { dependent, required, range, reason: 'not-installed' }
  if (satisfiesRange(installed.version, range)) return null
  return {
    dependent,
    required,
    range,
    reason: 'version-mismatch',
    installedVersion: installed.version
  }
}

/** Thrown when a dependency graph contains a cycle. */
export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' → ')}`)
    this.name = 'DependencyCycleError'
  }
}

/**
 * Return the ids in a safe install order (dependencies before dependents).
 * Only edges *within the provided set* are ordered; dependencies on plugins not
 * in the set are ignored here (use {@link findMissingDependencies} for those).
 *
 * @throws {DependencyCycleError} if the graph cannot be linearised.
 */
export function resolveInstallOrder(nodes: readonly DependencyNode[]): string[] {
  const byId = indexById(nodes)
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (id: string): void => {
    const current = state.get(id)
    if (current === 'done') return
    if (current === 'visiting') {
      const from = stack.indexOf(id)
      throw new DependencyCycleError([...stack.slice(from), id])
    }
    const node = byId.get(id)
    if (!node) return // outside the set — handled by findMissingDependencies
    state.set(id, 'visiting')
    stack.push(id)
    for (const dep of Object.keys(node.dependencies ?? {})) {
      if (byId.has(dep)) visit(dep)
    }
    stack.pop()
    state.set(id, 'done')
    order.push(id)
  }

  for (const node of nodes) visit(node.id)
  return order
}
