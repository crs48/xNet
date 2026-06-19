import { describe, expect, it } from 'vitest'
import { viewIdForPath } from './views'

describe('viewIdForPath', () => {
  it('maps the root path to home', () => {
    expect(viewIdForPath('/')).toBe('home')
    expect(viewIdForPath('')).toBe('home')
  })

  it('passes through singleton routes unchanged', () => {
    expect(viewIdForPath('/crm')).toBe('crm')
    expect(viewIdForPath('/tasks')).toBe('tasks')
    expect(viewIdForPath('/data')).toBe('data')
    expect(viewIdForPath('/discover')).toBe('discover')
    expect(viewIdForPath('/settings')).toBe('settings')
  })

  it('collapses dynamic routes to one stable view id', () => {
    expect(viewIdForPath('/doc/abc')).toBe('page')
    expect(viewIdForPath('/doc/xyz')).toBe('page')
    expect(viewIdForPath('/db/123')).toBe('database')
    expect(viewIdForPath('/canvas/c1')).toBe('canvas')
    expect(viewIdForPath('/channel/general')).toBe('channel')
    expect(viewIdForPath('/view/v1')).toBe('savedview')
  })

  it('tolerates trailing segments and leading slashes', () => {
    expect(viewIdForPath('/crm/contacts/42')).toBe('crm')
    expect(viewIdForPath('crm')).toBe('crm')
  })
})
