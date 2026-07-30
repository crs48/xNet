import { describe, expect, it } from 'vitest'
import { classifyChannel } from '../../core/log-store'

describe('classifyChannel', () => {
  it('tags sqlite/OPFS output', () => {
    expect(classifyChannel('[WebSQLiteAdapter] opened')).toBe('sqlite')
    expect(classifyChannel('OPFS pool ready')).toBe('sqlite')
  })
  it('tags sync output', () => {
    expect(classifyChannel('[Sync] connected to hub')).toBe('sync')
    expect(classifyChannel('ConnectionManager retrying')).toBe('sync')
  })
  it('tags query output', () => {
    expect(classifyChannel('[Query] plan: storage-query')).toBe('query')
  })
  it('tags the real query-plan line under query, not sqlite', () => {
    expect(classifyChannel('[SQLiteNodeStorageAdapter] query plan for Task')).toBe('query')
  })
  it('tags the real WS sync provider prefix under sync', () => {
    expect(classifyChannel('[WSSyncProvider:room-1] connected')).toBe('sync')
  })
  it('tags boot + trace output', () => {
    expect(classifyChannel('boot timeline ready')).toBe('boot')
    expect(classifyChannel('trace flushed')).toBe('trace')
  })
  it('falls back to general', () => {
    expect(classifyChannel('hello world')).toBe('general')
  })
})
