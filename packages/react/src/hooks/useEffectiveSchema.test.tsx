/**
 * Tests for useEffectiveSchema — composes a built-in core schema with live
 * extension fields read through the data bridge.
 */

import type { QueryFilter } from './useQuery'
import type { DataBridge } from '@xnetjs/data-bridge'
import { renderHook, waitFor } from '@testing-library/react'
import {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  type DefinedSchema,
  type NodeState,
  type PropertyBuilder,
  type SchemaIRI
} from '@xnetjs/data'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataBridgeContext } from '../context'
import { useEffectiveSchema } from './useEffectiveSchema'

const TASK_IRI = 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI

function node(id: string, schemaId: string, properties: Record<string, unknown>): NodeState {
  const now = 1
  return {
    id,
    schemaId: schemaId as SchemaIRI,
    properties,
    timestamps: {},
    createdAt: now,
    createdBy: 'did:key:test',
    updatedAt: now,
    updatedBy: 'did:key:test',
    deleted: false
  }
}

function createMockBridge() {
  const snapshots = new Map<string, NodeState[] | null>()
  const queryId = <P extends Record<string, PropertyBuilder>>(schema: DefinedSchema<P>) =>
    serializeQueryDescriptor(createQueryDescriptor(schema._schemaId, {}))

  const bridge: DataBridge = {
    query(schema) {
      const id = queryId(schema)
      return {
        getSnapshot: () => snapshots.get(id) ?? null,
        getMetadata: () => null,
        subscribe: () => () => {}
      }
    },
    reloadQuery: vi.fn(async () => {}),
    async create() {
      throw new Error('not implemented')
    },
    async update() {
      throw new Error('not implemented')
    },
    async delete() {
      throw new Error('not implemented')
    },
    async restore() {
      throw new Error('not implemented')
    },
    async bulkWrite() {
      throw new Error('not implemented')
    },
    destroy() {},
    status: 'connected',
    on() {
      return () => {}
    }
  }

  return {
    bridge,
    setSnapshot<P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      data: NodeState[]
    ) {
      snapshots.set(queryId(schema), data)
    }
  }
}

function wrapperFor(bridge: DataBridge) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <DataBridgeContext.Provider value={bridge}>{children}</DataBridgeContext.Provider>
  }
}

describe('useEffectiveSchema', () => {
  it('returns the core built-in schema unchanged when no extensions exist', async () => {
    const mock = createMockBridge()
    mock.setSnapshot(SchemaExtensionSchema, [])
    mock.setSnapshot(ExtensionFieldSchema, [])

    const { result } = renderHook(() => useEffectiveSchema(TASK_IRI), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() => expect(result.current.schema?.name).toBe('Task'))
    expect(result.current.schema?.properties.some((p) => p.readonly)).toBe(false)
  })

  it('composes live extension fields onto the core schema (core locked)', async () => {
    const mock = createMockBridge()
    mock.setSnapshot(SchemaExtensionSchema, [
      node('schemaext:acme.com:' + TASK_IRI, SchemaExtensionSchema._schemaId, {
        targetSchema: TASK_IRI,
        authority: 'acme.com'
      })
    ])
    mock.setSnapshot(ExtensionFieldSchema, [
      node('f1', ExtensionFieldSchema._schemaId, {
        extension: 'schemaext:acme.com:' + TASK_IRI,
        name: 'billableRate',
        type: 'number',
        sortKey: 'a0'
      })
    ])

    const { result } = renderHook(() => useEffectiveSchema(TASK_IRI), {
      wrapper: wrapperFor(mock.bridge)
    })

    await waitFor(() =>
      expect(result.current.schema?.properties.some((p) => p.name === 'ext:acme.com/billableRate')).toBe(
        true
      )
    )
    const titleCol = result.current.schema?.properties.find((p) => p.name === 'title')
    expect(titleCol?.readonly).toBe(true)
  })

  it('returns null schema for an unresolvable IRI', async () => {
    const mock = createMockBridge()
    mock.setSnapshot(SchemaExtensionSchema, [])
    mock.setSnapshot(ExtensionFieldSchema, [])

    const { result } = renderHook(
      () => useEffectiveSchema('xnet://xnet.fyi/Nope@1.0.0' as SchemaIRI),
      { wrapper: wrapperFor(mock.bridge) }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.schema).toBeNull()
  })
})
