/**
 * Schema Lens System - Bidirectional transformations between schema versions.
 *
 * A lens defines how to transform data from one schema version to another,
 * enabling automatic migrations during read operations.
 *
 * @example
 * ```typescript
 * const taskV1toV2: SchemaLens = {
 *   source: 'xnet://xnet.fyi/Task@1.0.0',
 *   target: 'xnet://xnet.fyi/Task@2.0.0',
 *   forward: (data) => ({
 *     ...data,
 *     status: data.complete ? 'done' : 'todo',
 *     priority: data.priority ?? 'medium'
 *   }),
 *   backward: (data) => ({
 *     ...data,
 *     complete: data.status === 'done'
 *   }),
 *   lossless: false // priority is lost in backward transform
 * }
 *
 * registry.register(taskV1toV2)
 * const migrated = registry.transform(oldData, 'Task@1.0.0', 'Task@2.0.0')
 * ```
 */

import type { SchemaIRI } from './node'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A bidirectional transformation between two schema versions.
 */
export interface SchemaLens {
  /** Source schema IRI (versioned) */
  source: SchemaIRI
  /** Target schema IRI (versioned) */
  target: SchemaIRI
  /** Transform data from source to target schema */
  forward: (data: Record<string, unknown>) => Record<string, unknown>
  /** Transform data from target back to source schema */
  backward: (data: Record<string, unknown>) => Record<string, unknown>
  /** Whether the transformation preserves all data (can round-trip without loss) */
  lossless: boolean
}

/**
 * A single lens operation (used by lens builders).
 * Can be composed into a full SchemaLens.
 */
export interface LensOperation {
  /** Transform data forward */
  forward: (data: Record<string, unknown>) => Record<string, unknown>
  /** Transform data backward */
  backward: (data: Record<string, unknown>) => Record<string, unknown>
  /** Whether this operation is lossless (defaults to true) */
  lossless?: boolean
}

/**
 * Result of a migration transformation.
 */
export interface MigrationResult {
  /** The transformed data */
  data: Record<string, unknown>
  /** The path of lenses applied */
  path: SchemaLens[]
  /** Whether all transformations were lossless */
  lossless: boolean
  /** Warnings about potential data loss */
  warnings: string[]
}

/**
 * Error thrown when migration fails.
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly source?: SchemaIRI,
    public readonly target?: SchemaIRI
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

// ─── LensRegistry ────────────────────────────────────────────────────────────

/**
 * Registry for schema lenses with pathfinding for multi-step migrations.
 *
 * The registry finds the shortest path between schema versions using BFS,
 * allowing automatic migrations through intermediate versions.
 *
 * @example
 * ```typescript
 * const registry = new LensRegistry()
 *
 * // Register direct migrations
 * registry.register(taskV1toV2)
 * registry.register(taskV2toV3)
 *
 * // Can now migrate from v1 to v3 through v2
 * const migrated = registry.transform(v1Data, 'Task@1.0.0', 'Task@3.0.0')
 * ```
 */
export class LensRegistry {
  private lenses = new Map<string, SchemaLens>()
  private pathCache = new Map<string, SchemaLens[] | null>()

  /**
   * Register a lens for transforming between two schema versions.
   * Also registers the reverse transformation automatically.
   */
  register(lens: SchemaLens): void {
    const forwardKey = `${lens.source}→${lens.target}`
    this.lenses.set(forwardKey, lens)

    // Register reverse lens
    const reverseLens: SchemaLens = {
      source: lens.target,
      target: lens.source,
      forward: lens.backward,
      backward: lens.forward,
      lossless: lens.lossless
    }
    const backwardKey = `${lens.target}→${lens.source}`
    this.lenses.set(backwardKey, reverseLens)

    // Invalidate path cache when new lenses are added
    this.pathCache.clear()
  }

  /**
   * Unregister a lens (and its reverse).
   */
  unregister(source: SchemaIRI, target: SchemaIRI): boolean {
    const forwardKey = `${source}→${target}`
    const backwardKey = `${target}→${source}`
    const removedForward = this.lenses.delete(forwardKey)
    const removedBackward = this.lenses.delete(backwardKey)
    const removed = removedForward || removedBackward
    if (removed) {
      this.pathCache.clear()
    }
    return removed
  }

  /**
   * Get a direct lens between two schemas (if registered).
   */
  get(source: SchemaIRI, target: SchemaIRI): SchemaLens | undefined {
    return this.lenses.get(`${source}→${target}`)
  }

  /**
   * Check if a direct lens exists between two schemas.
   */
  has(source: SchemaIRI, target: SchemaIRI): boolean {
    return this.lenses.has(`${source}→${target}`)
  }

  /**
   * Find the shortest path of lenses between two schema versions.
   * Uses BFS to find the optimal path through intermediate versions.
   *
   * @returns Array of lenses to apply in order, or null if no path exists
   */
  findPath(from: SchemaIRI, to: SchemaIRI): SchemaLens[] | null {
    if (from === to) return []

    const cacheKey = `${from}→${to}`
    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey) ?? null
    }

    const path = this.bfsPath(from, to)
    this.pathCache.set(cacheKey, path)
    return path
  }

  /**
   * Transform data from one schema version to another.
   *
   * @throws MigrationError if no path exists between schemas
   */
  transform(
    data: Record<string, unknown>,
    from: SchemaIRI,
    to: SchemaIRI
  ): Record<string, unknown> {
    if (from === to) return data

    const path = this.findPath(from, to)
    if (!path) {
      throw new MigrationError(`No migration path from ${from} to ${to}`, from, to)
    }

    let result = data
    for (const lens of path) {
      result = lens.forward(result)
    }
    return result
  }

  /**
   * Transform data with detailed migration result.
   */
  transformWithDetails(
    data: Record<string, unknown>,
    from: SchemaIRI,
    to: SchemaIRI
  ): MigrationResult {
    if (from === to) {
      return { data, path: [], lossless: true, warnings: [] }
    }

    const path = this.findPath(from, to)
    if (!path) {
      throw new MigrationError(`No migration path from ${from} to ${to}`, from, to)
    }

    const warnings: string[] = []
    let result = data
    let allLossless = true

    for (const lens of path) {
      result = lens.forward(result)
      if (!lens.lossless) {
        allLossless = false
        warnings.push(`Lossy transformation: ${lens.source} → ${lens.target}`)
      }
    }

    return { data: result, path, lossless: allLossless, warnings }
  }

  /**
   * Check if a migration path exists between two schemas.
   */
  canMigrate(from: SchemaIRI, to: SchemaIRI): boolean {
    return this.findPath(from, to) !== null
  }

  /**
   * Check if a migration path is lossless (all transformations preserve data).
   */
  isLossless(from: SchemaIRI, to: SchemaIRI): boolean {
    const path = this.findPath(from, to)
    if (!path) return false
    return path.every((lens) => lens.lossless)
  }

  /**
   * Get all registered schema IRIs.
   */
  getSchemas(): SchemaIRI[] {
    const schemas = new Set<SchemaIRI>()
    for (const lens of this.lenses.values()) {
      schemas.add(lens.source)
      schemas.add(lens.target)
    }
    return Array.from(schemas)
  }

  /**
   * Clear all registered lenses and cached paths.
   */
  clear(): void {
    this.lenses.clear()
    this.pathCache.clear()
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  /**
   * BFS pathfinding to find shortest lens path between schemas.
   */
  private bfsPath(from: SchemaIRI, to: SchemaIRI): SchemaLens[] | null {
    // Build adjacency list from registered lenses
    const adjacency = new Map<SchemaIRI, Array<{ target: SchemaIRI; lens: SchemaLens }>>()

    for (const lens of this.lenses.values()) {
      const neighbors = adjacency.get(lens.source) ?? []
      neighbors.push({ target: lens.target, lens })
      adjacency.set(lens.source, neighbors)
    }

    // BFS
    const visited = new Set<SchemaIRI>()
    const queue: Array<{ schema: SchemaIRI; path: SchemaLens[] }> = [{ schema: from, path: [] }]

    while (queue.length > 0) {
      const { schema, path } = queue.shift()!

      if (schema === to) {
        return path
      }

      if (visited.has(schema)) {
        continue
      }
      visited.add(schema)

      const neighbors = adjacency.get(schema) ?? []
      for (const { target, lens } of neighbors) {
        if (!visited.has(target)) {
          queue.push({ schema: target, path: [...path, lens] })
        }
      }
    }

    return null // No path found
  }
}

// ─── Default Registry ────────────────────────────────────────────────────────

/**
 * Default global lens registry instance.
 */
export const lensRegistry = new LensRegistry()
