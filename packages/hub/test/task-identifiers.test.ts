import { describe, expect, it } from 'vitest'
import { TaskIdentifierError, TaskIdentifierService } from '../src/services/task-identifiers'

describe('TaskIdentifierService', () => {
  it('allocates monotonic non-overlapping blocks per workspace prefix', () => {
    const service = new TaskIdentifierService()

    const first = service.allocateBlock({ workspaceId: 'ws-1', prefix: 'XN', size: 100 })
    const second = service.allocateBlock({ workspaceId: 'ws-1', prefix: 'XN', size: 50 })

    expect(first).toEqual({ prefix: 'XN', start: 1, end: 100 })
    expect(second).toEqual({ prefix: 'XN', start: 101, end: 150 })
    expect(service.highestAllocated('ws-1', 'XN')).toBe(150)
  })

  it('keeps workspaces and prefixes independent', () => {
    const service = new TaskIdentifierService()

    service.allocateBlock({ workspaceId: 'ws-1', prefix: 'XN', size: 10 })
    const other = service.allocateBlock({ workspaceId: 'ws-2', prefix: 'XN', size: 10 })
    const otherPrefix = service.allocateBlock({ workspaceId: 'ws-1', prefix: 'OPS', size: 10 })

    expect(other.start).toBe(1)
    expect(otherPrefix.start).toBe(1)
  })

  it('normalizes prefix case and clamps block size', () => {
    const service = new TaskIdentifierService()

    const block = service.allocateBlock({ workspaceId: 'ws-1', prefix: 'xn', size: 99999 })
    expect(block.prefix).toBe('XN')
    expect(block.end - block.start + 1).toBe(1000)
  })

  it('rejects invalid prefixes and workspaces', () => {
    const service = new TaskIdentifierService()

    expect(() => service.allocateBlock({ workspaceId: 'ws-1', prefix: 'TOOLONG' })).toThrow(
      TaskIdentifierError
    )
    expect(() => service.allocateBlock({ workspaceId: 'ws-1', prefix: '1A' })).toThrow(
      TaskIdentifierError
    )
    expect(() => service.allocateBlock({ workspaceId: '', prefix: 'XN' })).toThrow(
      TaskIdentifierError
    )
  })
})
