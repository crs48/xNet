import type { TenantRecord } from './registry'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { renderClaimForm, renderDashboard, type DashboardView } from './dashboard'

function connectedTenant(): TenantRecord {
  return {
    tenantId: 't_1',
    plan: 'personal',
    entitlements: resolveEntitlements('personal'),
    billingUserId: 'user_a',
    did: 'did:key:zAbc',
    hubUrl: 'https://hub.example',
    substrateRef: 'machine_1',
    region: 'auto',
    targetVersion: 'xnet-hub@1.0.0',
    createdAt: 1000,
    lastActiveMs: 1000,
    dataTier: 'hot',
    subscriptionStatus: 'active'
  }
}

const baseView = (overrides: Partial<DashboardView> = {}): DashboardView => ({
  billingUserId: 'user_a',
  tenant: null,
  checkoutPlans: [],
  billingEnabled: false,
  appUrl: 'https://app.example/app',
  ...overrides
})

describe('dashboard header — Open web app', () => {
  it('renders a header button to the web app even before a hub is connected', () => {
    const html = renderDashboard(baseView({ tenant: null }))
    expect(html).toContain('Open web app')
    expect(html).toContain('class="btn header-btn"')
    expect(html).toContain('href="https://app.example/app"')
    expect(html).toContain('target="_blank"')
    // The pre-connect state otherwise shows the plan picker, not the connect card.
    expect(html).toContain('Welcome to xNet Cloud')
  })

  it('uses the default web app URL when none is configured', () => {
    const view = baseView()
    delete view.appUrl
    const html = renderDashboard(view)
    expect(html).toContain('href="https://xnet.fyi/app"')
    expect(html).toContain('Open web app')
  })

  it('keeps the header button available once a hub is connected', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).toContain('class="btn header-btn"')
    expect(html).toContain('href="https://app.example/app"')
    // Connected card still carries its own contextual link too.
    expect(html).toContain('Open the app')
  })

  it('escapes the web app URL in the header link', () => {
    const html = renderDashboard(baseView({ appUrl: 'https://x.example/"><script>' }))
    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('omits the header button on pages with no web app URL (e.g. the claim form)', () => {
    const html = renderClaimForm({ who: 'user_a' })
    // The .header-btn rule lives in the shared <style>, so assert on the button
    // itself (its label + anchor), which only renders when an appUrl is passed.
    expect(html).not.toContain('Open web app')
    expect(html).not.toContain('class="btn header-btn"')
  })
})
