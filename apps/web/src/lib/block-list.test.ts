import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  blockStateOf,
  contactSevered,
  hidesContent,
  loadBlockList,
  useBlockList
} from './block-list'

describe('block list', () => {
  beforeEach(() => localStorage.clear())

  it('a DID lives in exactly one bucket; later actions move it', () => {
    const { result } = renderHook(() => useBlockList())
    act(() => result.current.mute('did:a'))
    expect(result.current.stateOf('did:a')).toBe('muted')
    act(() => result.current.block('did:a'))
    expect(result.current.stateOf('did:a')).toBe('blocked')
    expect(result.current.list.muted).not.toContain('did:a')
    act(() => result.current.unblock('did:a'))
    expect(result.current.stateOf('did:a')).toBeNull()
  })

  it('blocked and muted hide content; restricted does not', () => {
    const list = { blocked: ['b'], muted: ['m'], restricted: ['r'] }
    expect(hidesContent(list, 'b')).toBe(true)
    expect(hidesContent(list, 'm')).toBe(true)
    expect(hidesContent(list, 'r')).toBe(false)
    expect(hidesContent(list, 'x')).toBe(false)
  })

  it('only blocking severs contact', () => {
    const list = { blocked: ['b'], muted: ['m'], restricted: ['r'] }
    expect(contactSevered(list, 'b')).toBe(true)
    expect(contactSevered(list, 'm')).toBe(false)
    expect(contactSevered(list, 'r')).toBe(false)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useBlockList())
    act(() => result.current.block('did:z'))
    expect(loadBlockList().blocked).toContain('did:z')
    expect(blockStateOf(loadBlockList(), 'did:z')).toBe('blocked')
  })
})
