import { describe, expect, it } from 'vitest'
import { AUTHZ_TABS } from './authz-config'
import { DEVTOOLS_PANELS } from './panel-registry'

describe('AuthZ panel wiring', () => {
  it('registers AuthZ as a top-level devtools panel', () => {
    const panelIds = DEVTOOLS_PANELS.map((panel) => panel.id)
    expect(panelIds).toContain('authz')
  })

  it('exposes all five AuthZ sub-tabs', () => {
    expect(AUTHZ_TABS).toEqual(['playground', 'grants', 'timeline', 'delegation', 'propagation'])
  })
})
