/**
 * Tests for useGridDatabase — the V2 database hook.
 */

import type { DID } from '@xnetjs/core'
import { renderHook, act, waitFor } from '@testing-library/react'
import { DatabaseSchema, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { generateIdentity, type Identity } from '@xnetjs/identity'
import React, { type ReactNode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { XNetProvider } from '../context'
import { useGridDatabase } from './useGridDatabase'
import { useNodeStore } from './useNodeStore'

describe('useGridDatabase', () => {
  let identityResult: { identity: Identity; privateKey: Uint8Array }
  let did: DID
  let storage: MemoryNodeStorageAdapter

  beforeEach(() => {
    identityResult = generateIdentity()
    did = identityResult.identity.did as DID
    storage = new MemoryNodeStorageAdapter()
  })

  function createWrapper() {
    const currentStorage = storage
    const currentDid = did
    const currentKey = identityResult.privateKey

    return function Wrapper({ children }: { children: ReactNode }) {
      const stableStorage = useMemo(() => currentStorage, [])
      return (
        <XNetProvider
          config={{
            nodeStorage: stableStorage,
            authorDID: currentDid,
            signingKey: currentKey,
            disableSyncManager: true
          }}
        >
          {children}
        </XNetProvider>
      )
    }
  }

  async function setupDatabase(wrapper: ReturnType<typeof createWrapper>): Promise<string> {
    const { result: storeResult } = renderHook(() => useNodeStore(), { wrapper })
    await waitFor(() => expect(storeResult.current.isReady).toBe(true))

    let databaseId = ''
    await act(async () => {
      const database = await storeResult.current.store?.create({
        schemaId: DatabaseSchema.schema['@id'],
        properties: { title: 'Tasks' }
      })
      databaseId = database?.id ?? ''
    })
    expect(databaseId).not.toBe('')
    return databaseId
  }

  it('creates fields, views, and rows; rows expose extracted cells', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)

    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let titleId = ''
    await act(async () => {
      titleId = (await result.current.addField('Title', 'text')) ?? ''
      await result.current.addView('Table', 'table')
    })
    await waitFor(() => expect(result.current.fields).toHaveLength(1))
    await waitFor(() => expect(result.current.views).toHaveLength(1))

    await act(async () => {
      await result.current.addRow(undefined, { [titleId]: 'A' })
      await result.current.addRow(undefined, { [titleId]: 'B' })
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    expect(result.current.rows.map((r) => r.cells[titleId])).toEqual(['A', 'B'])
    expect(result.current.activeView?.name).toBe('Table')
  })

  it('updates and clears cells', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let titleId = ''
    let rowId: string | null = null
    await act(async () => {
      titleId = (await result.current.addField('Title', 'text')) ?? ''
      rowId = await result.current.addRow(undefined, { [titleId]: 'before' })
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))

    await act(async () => {
      await result.current.updateCell(rowId!, titleId, 'after')
    })
    await waitFor(() => expect(result.current.rows[0]?.cells[titleId]).toBe('after'))

    await act(async () => {
      await result.current.clearCells([{ rowId: rowId!, fieldId: titleId }])
    })
    await waitFor(() => {
      const value = result.current.rows[0]?.cells[titleId]
      expect(value === null || value === undefined).toBe(true)
    })
  })

  it('moveRowToIndex reorders rows by fractional key', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // A view must exist: the app always bootstraps one, and with an active
    // view the row list goes through sortRows (which once used locale
    // collation and reverted moves — the drag-and-drop regression).
    let titleId = ''
    await act(async () => {
      titleId = (await result.current.addField('Title', 'text')) ?? ''
      await result.current.addView('Table', 'table')
      await result.current.addRow(undefined, { [titleId]: 'A' })
      await result.current.addRow(undefined, { [titleId]: 'B' })
      await result.current.addRow(undefined, { [titleId]: 'C' })
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    await waitFor(() => expect(result.current.activeView).not.toBeNull())

    const idOf = (title: string): string =>
      result.current.rows.find((r) => r.cells[titleId] === title)!.id

    // Move to the front (generates a prepend 'Z…' key — the case locale
    // collation used to misorder)
    await act(async () => {
      await result.current.moveRowToIndex(idOf('C'), 0)
    })
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.cells[titleId])).toEqual(['C', 'A', 'B'])
    )

    // Move to the end
    await act(async () => {
      await result.current.moveRowToIndex(idOf('C'), 2)
    })
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.cells[titleId])).toEqual(['A', 'B', 'C'])
    )
  })

  it('view sorts and filters shape the row list', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let countId = ''
    await act(async () => {
      countId = (await result.current.addField('Count', 'number')) ?? ''
      await result.current.addView('Table', 'table')
      await result.current.addRow(undefined, { [countId]: 2 })
      await result.current.addRow(undefined, { [countId]: 3 })
      await result.current.addRow(undefined, { [countId]: 1 })
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(3))

    // toggleSort: none -> asc
    await act(async () => {
      await result.current.toggleSort(countId)
    })
    await waitFor(() => expect(result.current.rows.map((r) => r.cells[countId])).toEqual([1, 2, 3]))

    // asc -> desc
    await act(async () => {
      await result.current.toggleSort(countId)
    })
    await waitFor(() => expect(result.current.rows.map((r) => r.cells[countId])).toEqual([3, 2, 1]))

    // desc -> none (back to manual order)
    await act(async () => {
      await result.current.toggleSort(countId)
    })
    await waitFor(() => expect(result.current.rows.map((r) => r.cells[countId])).toEqual([2, 3, 1]))

    // Filter: count > 1
    await act(async () => {
      await result.current.setFilters({
        operator: 'and',
        conditions: [{ columnId: countId, operator: 'greaterThan', value: 1 }]
      })
    })
    await waitFor(() => expect(result.current.rows.map((r) => r.cells[countId])).toEqual([2, 3]))
  })

  it('per-view field order, width, and hidden overrides apply to visibleFields', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let aId = ''
    let bId = ''
    let cId = ''
    await act(async () => {
      aId = (await result.current.addField('A', 'text')) ?? ''
      bId = (await result.current.addField('B', 'text')) ?? ''
      cId = (await result.current.addField('C', 'text')) ?? ''
      await result.current.addView('Table', 'table')
    })
    await waitFor(() => expect(result.current.visibleFields).toHaveLength(3))

    // Move C to the front (per-view override)
    await act(async () => {
      await result.current.moveFieldToIndex(cId, 0)
    })
    await waitFor(() =>
      expect(result.current.visibleFields.map((f) => f.name)).toEqual(['C', 'A', 'B'])
    )

    // Width override
    await act(async () => {
      await result.current.resizeField(aId, 333)
    })
    await waitFor(() =>
      expect(result.current.visibleFields.find((f) => f.id === aId)?.width).toBe(333)
    )

    // Hide B in this view
    await act(async () => {
      await result.current.setFieldHidden(bId, true)
    })
    await waitFor(() => expect(result.current.visibleFields.map((f) => f.name)).toEqual(['C', 'A']))
  })

  it('createOption dedupes by name and attaches options to select fields', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let statusId = ''
    await act(async () => {
      statusId = (await result.current.addField('Status', 'select')) ?? ''
    })
    await waitFor(() => expect(result.current.fields).toHaveLength(1))

    let first: string | null = null
    await act(async () => {
      first = await result.current.createOption(statusId, 'Urgent')
    })
    await waitFor(() =>
      expect(result.current.fields[0]?.options?.map((o) => o.name)).toEqual(['Urgent'])
    )

    // Same name (case-insensitive) returns the existing option
    let second: string | null = null
    await act(async () => {
      second = await result.current.createOption(statusId, 'urgent')
    })
    expect(second).toBe(first)
    await waitFor(() => expect(result.current.fields[0]?.options).toHaveLength(1))
  })

  it('deletes rows and fields (with their options)', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let statusId = ''
    let rowId: string | null = null
    await act(async () => {
      statusId = (await result.current.addField('Status', 'select')) ?? ''
      await result.current.createOption(statusId, 'X')
      rowId = await result.current.addRow()
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))

    await act(async () => {
      await result.current.deleteRows([rowId!])
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(0))

    await act(async () => {
      await result.current.removeField(statusId)
    })
    await waitFor(() => expect(result.current.fields).toHaveLength(0))
  })

  it('formula fields compute from other cells and react to edits', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let priceId = ''
    let qtyId = ''
    let totalId = ''
    let rowId: string | null = null
    await act(async () => {
      priceId = (await result.current.addField('Price', 'number')) ?? ''
      qtyId = (await result.current.addField('Qty', 'number')) ?? ''
      totalId =
        (await result.current.addField('Total', 'formula', {
          expression: `{{${'PRICE'}}}`, // placeholder, replaced below
          resultType: 'number'
        } as never)) ?? ''
    })
    await waitFor(() => expect(result.current.fields).toHaveLength(3))

    await act(async () => {
      await result.current.updateFieldConfig(totalId, {
        expression: `{{${priceId}}} * {{${qtyId}}}`,
        resultType: 'number'
      } as never)
      rowId = await result.current.addRow(undefined, { [priceId]: 5, [qtyId]: 4 })
    })

    await waitFor(() => expect(result.current.rows[0]?.cells[totalId]).toBe(20))

    // Editing a dependency recomputes the formula
    await act(async () => {
      await result.current.updateCell(rowId!, qtyId, 10)
    })
    await waitFor(() => expect(result.current.rows[0]?.cells[totalId]).toBe(50))
  })

  it('changeFieldType converts existing cell values (text → multiSelect, text → number)', async () => {
    const wrapper = createWrapper()
    const databaseId = await setupDatabase(wrapper)
    const { result } = renderHook(() => useGridDatabase(databaseId), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let tagsId = ''
    let amountId = ''
    await act(async () => {
      tagsId = (await result.current.addField('Tags', 'text')) ?? ''
      amountId = (await result.current.addField('Amount', 'text')) ?? ''
      await result.current.addRow(undefined, {
        [tagsId]: 'red, blue',
        [amountId]: '$1,250.50'
      })
      await result.current.addRow(undefined, { [tagsId]: 'blue', [amountId]: 'n/a' })
    })
    await waitFor(() => expect(result.current.rows).toHaveLength(2))

    // text → multiSelect: comma-separated values become option nodes
    await act(async () => {
      await result.current.changeFieldType(tagsId, 'multiSelect')
    })
    await waitFor(() => {
      const field = result.current.fields.find((f) => f.id === tagsId)
      expect(field?.type).toBe('multiSelect')
      expect(field?.options?.map((o) => o.name).sort()).toEqual(['blue', 'red'])
    })
    await waitFor(() => {
      const field = result.current.fields.find((f) => f.id === tagsId)!
      const idFor = (name: string) => field.options!.find((o) => o.name === name)!.id
      expect(result.current.rows[0]?.cells[tagsId]).toEqual([idFor('red'), idFor('blue')])
      expect(result.current.rows[1]?.cells[tagsId]).toEqual([idFor('blue')])
    })

    // text → number: numerics parse, garbage clears
    await act(async () => {
      await result.current.changeFieldType(amountId, 'number')
    })
    await waitFor(() => {
      expect(result.current.rows[0]?.cells[amountId]).toBe(1250.5)
      const second = result.current.rows[1]?.cells[amountId]
      expect(second === null || second === undefined).toBe(true)
    })
  })

  it('rollup fields aggregate related rows across databases', async () => {
    const wrapper = createWrapper()
    const projectsDb = await setupDatabase(wrapper)
    const tasksDb = await setupDatabase(wrapper)

    // Tasks database: a points field and two rows
    const tasks = renderHook(() => useGridDatabase(tasksDb), { wrapper })
    await waitFor(() => expect(tasks.result.current.loading).toBe(false))
    let pointsId = ''
    let taskA: string | null = null
    let taskB: string | null = null
    await act(async () => {
      pointsId = (await tasks.result.current.addField('Points', 'number')) ?? ''
      taskA = await tasks.result.current.addRow(undefined, { [pointsId]: 3 })
      taskB = await tasks.result.current.addRow(undefined, { [pointsId]: 5 })
    })
    await waitFor(() => expect(tasks.result.current.rows).toHaveLength(2))

    // Projects database: relation → tasks, rollup sum(points)
    const projects = renderHook(() => useGridDatabase(projectsDb), { wrapper })
    await waitFor(() => expect(projects.result.current.loading).toBe(false))
    let relId = ''
    let rollupId = ''
    await act(async () => {
      relId =
        (await projects.result.current.addField('Tasks', 'relation', {
          targetDatabase: tasksDb
        } as never)) ?? ''
      rollupId =
        (await projects.result.current.addField('Total points', 'rollup', {
          relationColumn: '',
          targetColumn: '',
          aggregation: 'sum'
        } as never)) ?? ''
      await projects.result.current.updateFieldConfig(rollupId, {
        relationColumn: relId,
        targetColumn: pointsId,
        aggregation: 'sum'
      } as never)
      await projects.result.current.addRow(undefined, {
        [relId]: [taskA, taskB].filter((id): id is string => Boolean(id))
      })
    })

    await waitFor(() => expect(projects.result.current.rows[0]?.cells[rollupId]).toBe(8), {
      timeout: 10_000
    })
  })
})
