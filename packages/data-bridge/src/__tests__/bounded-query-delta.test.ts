/**
 * Property tests for the bounded-query delta engine.
 *
 * Random operation sequences are applied through
 * applyNodeChangeToBoundedQueryResult while a ground-truth node map is
 * re-executed with applyQueryDescriptor after every step. The visible
 * window produced by deltas must always equal the re-executed result —
 * the same comparison the SQLite parity audit performs.
 */

import type { NodeState, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  BOUNDED_QUERY_OVERFETCH,
  applyNodeChangeToBoundedQueryResult,
  applyQueryDescriptor,
  createBoundedWorkingSet,
  createBoundedWorkingSetDescriptor,
  queryDescriptorSupportsBoundedDelta,
  type BoundedQueryWorkingSet,
  type QueryDescriptor
} from '../index'

const TEST_SCHEMA_ID = 'xnet://test.local/DeltaNode@1.0.0' as SchemaIRI
const TEST_AUTHOR = 'did:key:delta-tester'

// Deterministic PRNG so failures are reproducible from the logged seed.
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!
}

let wallClock = 1_000_000

function createNode(input: {
  id: string
  title: string
  status: string | null
  priority: number
  updatedAt: number
  deleted?: boolean
}): NodeState {
  return {
    id: input.id,
    schemaId: TEST_SCHEMA_ID,
    properties: {
      title: input.title,
      ...(input.status === null ? {} : { status: input.status }),
      priority: input.priority
    },
    timestamps: {
      title: { lamport: 1, author: TEST_AUTHOR, wallTime: input.updatedAt }
    },
    deleted: input.deleted ?? false,
    createdAt: input.updatedAt,
    createdBy: TEST_AUTHOR,
    updatedAt: input.updatedAt,
    updatedBy: TEST_AUTHOR
  }
}

function randomNode(random: () => number, id: string): NodeState {
  wallClock += 1
  return createNode({
    id,
    title: `Title ${Math.floor(random() * 40)}`,
    status: pick(random, ['open', 'done', null]),
    priority: Math.floor(random() * 10),
    updatedAt: wallClock + Math.floor(random() * 5)
  })
}

const DESCRIPTOR_SHAPES: Array<Omit<QueryDescriptor, 'schemaId' | 'includeDeleted'>> = [
  { orderBy: { updatedAt: 'desc' }, limit: 5 },
  { orderBy: { title: 'asc' }, limit: 3 },
  { orderBy: { priority: 'asc', title: 'desc' }, limit: 10 },
  { orderBy: { updatedAt: 'desc' }, limit: 1, where: { status: 'open' } },
  { orderBy: { priority: 'desc' }, limit: 8, where: { status: 'open' } }
]

interface Simulation {
  descriptor: QueryDescriptor
  nodesById: Map<string, NodeState>
  workingSet: BoundedQueryWorkingSet
  visible: NodeState[]
  reloads: number
  steps: number
}

function fetchWorkingSet(simulation: Simulation): void {
  const overfetched = applyQueryDescriptor(
    Array.from(simulation.nodesById.values()),
    createBoundedWorkingSetDescriptor(simulation.descriptor)
  )
  simulation.workingSet = createBoundedWorkingSet(simulation.descriptor, overfetched)
  simulation.visible = overfetched.slice(0, simulation.descriptor.limit)
  simulation.reloads += 1
}

function applyOp(simulation: Simulation, nodeId: string, nextNode: NodeState | null): void {
  if (nextNode) {
    simulation.nodesById.set(nodeId, nextNode)
  } else {
    simulation.nodesById.delete(nodeId)
  }

  const delta = applyNodeChangeToBoundedQueryResult({
    descriptor: simulation.descriptor,
    workingSet: simulation.workingSet,
    nodeId,
    nextNode
  })
  simulation.steps += 1

  if (delta.kind === 'reload') {
    fetchWorkingSet(simulation)
    return
  }

  if (delta.kind === 'set') {
    simulation.workingSet = delta.workingSet
    simulation.visible = delta.data
  }
}

function expectParity(simulation: Simulation, context: string): void {
  const expected = applyQueryDescriptor(
    Array.from(simulation.nodesById.values()),
    simulation.descriptor
  )
  expect(
    simulation.visible.map((node) => node.id),
    context
  ).toEqual(expected.map((node) => node.id))
}

describe('applyNodeChangeToBoundedQueryResult', () => {
  it('supports limited+ordered descriptors and rejects offset/cursor/no-order shapes', () => {
    const base: QueryDescriptor = {
      schemaId: TEST_SCHEMA_ID,
      includeDeleted: false,
      orderBy: { updatedAt: 'desc' },
      limit: 10
    }

    expect(queryDescriptorSupportsBoundedDelta(base)).toBe(true)
    expect(queryDescriptorSupportsBoundedDelta({ ...base, offset: 5 })).toBe(false)
    expect(queryDescriptorSupportsBoundedDelta({ ...base, after: 'cursor' })).toBe(false)
    expect(queryDescriptorSupportsBoundedDelta({ ...base, orderBy: undefined })).toBe(false)
    expect(queryDescriptorSupportsBoundedDelta({ ...base, limit: undefined })).toBe(false)
    expect(
      queryDescriptorSupportsBoundedDelta({ ...base, materializedView: { viewId: 'view' } })
    ).toBe(false)
  })

  it('matches re-executed ground truth across randomized op sequences', () => {
    const SEQUENCES = 170
    const OPS_PER_SEQUENCE = 60

    for (let sequence = 0; sequence < SEQUENCES; sequence += 1) {
      const seed = 0xc0ffee + sequence * 7919
      const random = mulberry32(seed)
      const shape = DESCRIPTOR_SHAPES[sequence % DESCRIPTOR_SHAPES.length]!
      const descriptor: QueryDescriptor = {
        schemaId: TEST_SCHEMA_ID,
        includeDeleted: false,
        ...shape
      }

      const initialCount = Math.floor(random() * 60)
      const nodesById = new Map<string, NodeState>()
      for (let index = 0; index < initialCount; index += 1) {
        const node = randomNode(random, `seed-${sequence}-${index}`)
        nodesById.set(node.id, node)
      }

      const simulation: Simulation = {
        descriptor,
        nodesById,
        workingSet: { nodes: [], complete: true },
        visible: [],
        reloads: 0,
        steps: 0
      }
      fetchWorkingSet(simulation)
      simulation.reloads = 0
      expectParity(simulation, `seed=${seed} initial fetch`)

      let createdCount = 0
      for (let op = 0; op < OPS_PER_SEQUENCE; op += 1) {
        const ids = Array.from(simulation.nodesById.keys())
        const roll = random()

        if (roll < 0.35 || ids.length === 0) {
          // Create
          createdCount += 1
          const node = randomNode(random, `created-${sequence}-${createdCount}`)
          applyOp(simulation, node.id, node)
        } else if (roll < 0.8) {
          // Update: mutate sort/filter-relevant fields
          const id = pick(random, ids)
          const current = simulation.nodesById.get(id)!
          wallClock += 1
          const updated = createNode({
            id,
            title:
              random() < 0.5
                ? `Title ${Math.floor(random() * 40)}`
                : (current.properties.title as string),
            status: pick(random, ['open', 'done', null]),
            priority:
              random() < 0.5 ? Math.floor(random() * 10) : (current.properties.priority as number),
            updatedAt: random() < 0.7 ? wallClock : current.updatedAt
          })
          applyOp(simulation, id, updated)
        } else if (roll < 0.92) {
          // Soft delete (what NodeStore emits)
          const id = pick(random, ids)
          const current = simulation.nodesById.get(id)!
          const deletedNode: NodeState = { ...current, deleted: true }
          applyOp(simulation, id, deletedNode)
        } else {
          // Hard removal (nextNode null)
          const id = pick(random, ids)
          simulation.nodesById.delete(id)
          const delta = applyNodeChangeToBoundedQueryResult({
            descriptor: simulation.descriptor,
            workingSet: simulation.workingSet,
            nodeId: id,
            nextNode: null
          })
          if (delta.kind === 'reload') {
            fetchWorkingSet(simulation)
          } else if (delta.kind === 'set') {
            simulation.workingSet = delta.workingSet
            simulation.visible = delta.data
          }
        }

        expectParity(simulation, `seed=${seed} op=${op}`)
      }

      // The whole point: deltas should answer the overwhelming majority of
      // changes without re-executing the query.
      expect(simulation.reloads, `seed=${seed} reload count`).toBeLessThan(OPS_PER_SEQUENCE * 0.2)
    }
  })

  it('absorbs removals with buffered rows instead of reloading', () => {
    const descriptor: QueryDescriptor = {
      schemaId: TEST_SCHEMA_ID,
      includeDeleted: false,
      orderBy: { priority: 'asc' },
      limit: 2
    }
    const nodes = [1, 2, 3, 4, 5].map((priority) =>
      createNode({
        id: `node-${priority}`,
        title: `Node ${priority}`,
        status: 'open',
        priority,
        updatedAt: priority
      })
    )
    // Incomplete buffer: pretend storage truncated at limit + overfetch.
    const workingSet: BoundedQueryWorkingSet = { nodes, complete: false }

    const delta = applyNodeChangeToBoundedQueryResult({
      descriptor,
      workingSet,
      nodeId: 'node-1',
      nextNode: null
    })

    expect(delta.kind).toBe('set')
    if (delta.kind === 'set') {
      expect(delta.data.map((node) => node.id)).toEqual(['node-2', 'node-3'])
      expect(delta.workingSet.nodes).toHaveLength(4)
    }
  })

  it('reloads when an incomplete buffer underflows the visible window', () => {
    const descriptor: QueryDescriptor = {
      schemaId: TEST_SCHEMA_ID,
      includeDeleted: false,
      orderBy: { priority: 'asc' },
      limit: 2
    }
    const nodes = [1, 2].map((priority) =>
      createNode({
        id: `node-${priority}`,
        title: `Node ${priority}`,
        status: 'open',
        priority,
        updatedAt: priority
      })
    )
    const workingSet: BoundedQueryWorkingSet = { nodes, complete: false }

    const delta = applyNodeChangeToBoundedQueryResult({
      descriptor,
      workingSet,
      nodeId: 'node-1',
      nextNode: null
    })

    expect(delta.kind).toBe('reload')
  })

  it('treats beyond-buffer inserts as noops for incomplete windows', () => {
    const descriptor: QueryDescriptor = {
      schemaId: TEST_SCHEMA_ID,
      includeDeleted: false,
      orderBy: { priority: 'asc' },
      limit: 2
    }
    const capacity = 2 + BOUNDED_QUERY_OVERFETCH
    const nodes = Array.from({ length: capacity }, (_, index) =>
      createNode({
        id: `node-${index}`,
        title: `Node ${index}`,
        status: 'open',
        priority: index,
        updatedAt: index
      })
    )
    const workingSet = createBoundedWorkingSet(descriptor, nodes)
    expect(workingSet.complete).toBe(false)

    const beyond = createNode({
      id: 'node-beyond',
      title: 'Beyond',
      status: 'open',
      priority: capacity + 10,
      updatedAt: capacity + 10
    })
    const delta = applyNodeChangeToBoundedQueryResult({
      descriptor,
      workingSet,
      nodeId: beyond.id,
      nextNode: beyond
    })

    expect(delta.kind).toBe('noop')
  })
})
