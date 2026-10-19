import type { SQLiteNodeBatchApplyInput } from './types'
import { describe, expect, it } from 'vitest'
import { assertBatchConditions, assertBatchRecord } from './conditional-batch'
const record = {
  id: 'task',
  node: {
    id: 'task',
    schemaId: 'task',
    createdAt: 1,
    updatedAt: 1,
    createdBy: 'owner',
    deletedAt: null
  },
  properties: [
    {
      nodeId: 'task',
      propertyKey: 'title',
      value: new Uint8Array([1, 2]),
      lamportTime: 1,
      updatedBy: 'owner',
      updatedAt: 1
    }
  ]
}
describe('fixed SQLite conditional record decoder', () => {
  it('compares property bytes and stamps, metadata, absence, and tombstones', () => {
    expect(() => assertBatchRecord(record, record.node, record.properties)).not.toThrow()
    expect(() =>
      assertBatchRecord(record, { ...record.node, deletedAt: 2 }, record.properties)
    ).toThrow('conflict')
    expect(() =>
      assertBatchRecord(record, record.node, [
        { ...record.properties[0], value: new Uint8Array([1, 3]) }
      ])
    ).toThrow('conflict')
    expect(() =>
      assertBatchRecord(record, record.node, [{ ...record.properties[0], lamportTime: 2 }])
    ).toThrow('conflict')
    expect(() =>
      assertBatchRecord({ id: 'missing', node: null, properties: [] }, null, [])
    ).not.toThrow()
    expect(() =>
      assertBatchRecord({ id: 'missing', node: null, properties: [] }, record.node, [])
    ).toThrow('conflict')
  })
  it('checks deadlines before reading or mutating anything', () => {
    const input: NonNullable<SQLiteNodeBatchApplyInput['conditions']> = {
      deadline: 0,
      records: [record]
    }
    expect(() =>
      assertBatchConditions(input, () => {
        throw new Error('must not read')
      })
    ).toThrow('expired')
  })
})
