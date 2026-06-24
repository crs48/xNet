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

/** A provisioned tenant whose app has not yet bound a data identity (did === ''). */
function unconnectedTenant(): TenantRecord {
  return { ...connectedTenant(), did: '', hubUrl: 'wss://t-abc.hub.example' }
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

describe('dashboard — per-platform connect (guided)', () => {
  it('renders Web/Desktop/Mobile tabs with all three panels for an unconnected tenant', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('Connect your apps')
    expect(html).toContain('data-tab="web"')
    expect(html).toContain('data-tab="desktop"')
    expect(html).toContain('data-tab="mobile"')
    expect(html).toContain('data-panel="web"')
    expect(html).toContain('data-panel="desktop"')
    expect(html).toContain('data-panel="mobile"')
  })

  it('no-JS fallback: tab bar is hidden but the panels are not', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    // Tab bar carries `hidden` (revealed by JS); panels render without `hidden`
    // so all three stay visible when scripting is off.
    expect(html).toMatch(/<div class="tabs"[^>]*\shidden>/)
    expect(html).toContain('<section class="tabpanel" data-panel="web">')
    expect(html).toContain('<section class="tabpanel" data-panel="desktop">')
    // each panel has its own heading so the stacked no-JS view reads cleanly
    expect(html).toContain('On the web')
    expect(html).toContain('On desktop')
    expect(html).toContain('On mobile')
  })

  it('names the exact desktop Settings path and shows a copyable hub URL', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('Settings → Network')
    expect(html).toContain('Signaling server')
    expect(html).toContain('data-copy="hub-url"')
    expect(html).toContain('<code id="hub-url">wss://t-abc.hub.example</code>')
  })

  it('makes the hub card Endpoint copyable, with a distinct id from the desktop panel', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('data-copy="endpoint-url"')
    expect(html).toContain('id="endpoint-url"')
    // exactly one of each id — no duplicate-id collision
    expect(html.match(/id="hub-url"/g)).toHaveLength(1)
    expect(html.match(/id="endpoint-url"/g)).toHaveLength(1)
  })

  it('shows the connected confirmation (not tabs) once a device is bound', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).toContain('>Connected<')
    expect(html).toContain('Open the app')
    expect(html).not.toContain('data-tab="desktop"')
  })

  it('escapes a hostile hub URL in the copyable field', () => {
    const t = unconnectedTenant()
    t.hubUrl = 'wss://evil"><script>alert(1)</script>'
    const html = renderDashboard(baseView({ tenant: t }))
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('dashboard — getting-started checklist', () => {
  it('shows the checklist with a pending "Connect a device" step when unconnected', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('Get started')
    expect(html).toContain('Plan chosen')
    expect(html).toContain('Hub running')
    expect(html).toContain('Connect a device')
  })

  it('vanishes once every step is satisfied (a device is connected)', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).not.toContain('Get started')
  })

  it('is suppressed when the user has dismissed it via cookie', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant(), gettingStartedHidden: true }))
    expect(html).not.toContain('Get started')
    // …but the connect guidance is still there.
    expect(html).toContain('Connect your apps')
  })

  it('does not render for a tenantless (not-yet-subscribed) view', () => {
    const html = renderDashboard(baseView({ tenant: null }))
    expect(html).not.toContain('Get started')
  })
})

describe('dashboard — help links', () => {
  it('renders a help footer derived from the marketing URL', () => {
    const html = renderDashboard(baseView({ tenant: null, marketingUrl: 'https://xnet.fyi/cloud' }))
    expect(html).toContain('class="help-footer"')
    expect(html).toContain('href="https://xnet.fyi/cloud/pricing#faq"')
    expect(html).toContain('href="https://xnet.fyi/docs/guides/cloud-connect"')
    expect(html).toContain('href="https://xnet.fyi/docs/guides/hub"')
    expect(html).toContain('href="https://xnet.fyi/status"')
    expect(html).toContain('href="https://xnet.fyi/cloud"')
  })

  it('falls back to the public site when marketingUrl is misconfigured', () => {
    const html = renderDashboard(baseView({ tenant: null, marketingUrl: '/' }))
    expect(html).toContain('href="https://xnet.fyi/docs/guides/cloud-connect"')
    expect(html).toContain('href="https://xnet.fyi/status"')
  })

  it('derives FAQ/guide links from a custom marketing origin', () => {
    const html = renderDashboard(baseView({ tenant: null, marketingUrl: 'https://staging.example/cloud' }))
    expect(html).toContain('href="https://staging.example/cloud/pricing#faq"')
    expect(html).toContain('href="https://staging.example/docs/guides/cloud-connect"')
  })
})
