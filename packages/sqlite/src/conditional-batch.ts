import type { SQLRow, SQLValue, SQLiteNodeBatchApplyInput } from './types'

export const conditionHeadSql =
  'SELECT hash FROM changes WHERE node_id = ? ORDER BY lamport_time DESC, wall_time DESC, hash DESC LIMIT 1'

type Read = (sql: string, params: SQLValue[]) => SQLRow[]
export const conditionNodeSql =
  'SELECT id, schema_id AS schemaId, created_at AS createdAt, updated_at AS updatedAt, created_by AS createdBy, deleted_at AS deletedAt FROM nodes WHERE id = ?'
export const conditionPropertiesSql =
  'SELECT node_id AS nodeId, property_key AS propertyKey, value, lamport_time AS lamportTime, updated_by AS updatedBy, updated_at AS updatedAt FROM node_properties WHERE node_id = ? ORDER BY property_key'
const key = (value: unknown): string => {
  if (value instanceof Uint8Array) return JSON.stringify(Array.from(value))
  if (Array.isArray(value)) return `[${value.map(key).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${key(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function assertBatchDeadline(
  conditions: NonNullable<SQLiteNodeBatchApplyInput['conditions']>
): void {
  if (!Number.isFinite(conditions.deadline) || Date.now() >= conditions.deadline)
    throw new Error('Conditional transaction expired.')
}
export function assertBatchRecord(
  expected: NonNullable<SQLiteNodeBatchApplyInput['conditions']>['records'][number],
  node: SQLRow | null,
  properties: SQLRow[],
  head?: string
): void {
  const sorted = [...expected.properties].sort((a, b) =>
    a.propertyKey < b.propertyKey ? -1 : a.propertyKey > b.propertyKey ? 1 : 0
  )
  if (
    key(expected.node) !== key(node) ||
    key(sorted) !== key(properties) ||
    (expected.head !== undefined && expected.head !== head)
  )
    throw new Error('Conditional transaction conflict: a record changed before commit.')
}
export function assertBatchConditions(
  conditions: NonNullable<SQLiteNodeBatchApplyInput['conditions']>,
  read: Read
): void {
  assertBatchDeadline(conditions)
  for (const record of conditions.records)
    assertBatchRecord(
      record,
      read(conditionNodeSql, [record.id])[0] ?? null,
      read(conditionPropertiesSql, [record.id]),
      record.head === undefined
        ? undefined
        : (read(conditionHeadSql, [record.id])[0]?.hash as string | undefined)
    )
}
