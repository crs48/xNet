import { describe, expect, it } from 'vitest'
import { classifyChannel } from './useLogsPanel'

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
  it('tags boot + trace output', () => {
    expect(classifyChannel('boot timeline ready')).toBe('boot')
    expect(classifyChannel('trace flushed')).toBe('trace')
  })
  it('falls back to general', () => {
    expect(classifyChannel('hello world')).toBe('general')
  })
})
