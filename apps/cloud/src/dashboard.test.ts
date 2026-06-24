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
    // The link now pins the tenant's personal hub (connectedTenant hubUrl is
    // https://hub.example → dialed over WebSocket as wss://hub.example).
    expect(html).toContain('href="https://app.example/app?hub=wss%3A%2F%2Fhub.example"')
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
    // so all three stay visible + readable when scripting is off.
    expect(html).toMatch(/<div class="tabs"[^>]*\shidden>/)
    for (const p of ['web', 'desktop', 'mobile']) {
      expect(html).toMatch(
        new RegExp(
          `<section class="tabpanel" id="panel-${p}" data-panel="${p}" role="tabpanel"[^>]*>`
        )
      )
    }
    // no panel carries `hidden` in the server HTML (JS hides the inactive ones)
    expect(html).not.toMatch(/data-panel="[a-z]+"[^>]*\shidden/)
    // each panel has its own heading so the stacked no-JS view reads cleanly
    expect(html).toContain('On the web')
    expect(html).toContain('On desktop')
    expect(html).toContain('On mobile')
  })

  it('wires the WAI-ARIA tab pattern (tab ↔ tabpanel)', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('role="tablist"')
    expect(html).toContain('id="tab-web"')
    expect(html).toContain('aria-controls="panel-web"')
    expect(html).toContain('aria-labelledby="tab-web"')
    expect(html).toMatch(/id="panel-web"[^>]*role="tabpanel"/)
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

  it('shows the connected confirmation (not tabs) once a device is bound, with the help footer', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).toContain('>Connected<')
    expect(html).toContain('Open the app')
    expect(html).not.toContain('data-tab="desktop"')
    // The help footer is pinned on the populated (connected) dashboard, not just the
    // tenantless one.
    expect(html).toContain('class="help-footer"')
    expect(html).toContain('href="https://xnet.fyi/docs/guides/cloud-connect"')
  })

  it('shows a sleeping (not "pick up your data") message when the hub is cold', () => {
    const html = renderDashboard(
      baseView({ tenant: { ...connectedTenant(), dataTier: 'cold', hubUrl: '' } })
    )
    expect(html).toContain('>Connected<')
    expect(html).toContain('asleep')
  })

  it('suppresses the connect guidance for a canceled tenant (hub + billing cards cover it)', () => {
    const canceled: TenantRecord = {
      ...connectedTenant(),
      subscriptionStatus: 'canceled',
      dataTier: 'cold',
      hubUrl: '',
      did: ''
    }
    const html = renderDashboard(baseView({ tenant: canceled, billingEnabled: true }))
    expect(html).toContain('Canceled — suspended')
    expect(html).not.toContain('Connect your apps')
    expect(html).not.toContain('data-tab="desktop"')
    expect(html).not.toContain('Get started')
    expect(html).not.toContain('id="live-tiles"')
  })

  it('escapes a hostile hub URL in the copyable field', () => {
    const t = unconnectedTenant()
    t.hubUrl = 'wss://evil"><script>alert(1)</script>'
    const html = renderDashboard(baseView({ tenant: t }))
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })

  it('offers an "Open in desktop app" deep link for an allowlisted xNet hub', () => {
    const t = { ...unconnectedTenant(), hubUrl: 'https://t-abc.xnet.app' }
    const html = renderDashboard(baseView({ tenant: t }))
    expect(html).toContain('Open in desktop app')
    // https is normalized to wss and URL-encoded into the xnet://connect link.
    expect(html).toContain('href="xnet://connect?hub=wss%3A%2F%2Ft-abc.xnet.app"')
    // The copy-paste fallback is still present alongside the one-click button.
    expect(html).toContain('Signaling server')
    expect(html).toContain('data-copy="hub-url"')
  })

  it('omits the deep link for a hub off the xNet allowlist (copy-paste only)', () => {
    // The default unconnectedTenant hub (t-abc.hub.example) is not an xNet host.
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).not.toContain('Open in desktop app')
    expect(html).not.toContain('xnet://connect')
    // …but the manual desktop steps still render.
    expect(html).toContain('Settings → Network')
  })

  it('never offers the deep link once connected (no connect tabs at all)', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).not.toContain('xnet://connect')
  })
})

describe('dashboard — getting-started checklist', () => {
  it('shows the checklist with the done-state derived from tenant fields when unconnected', () => {
    const html = renderDashboard(baseView({ tenant: unconnectedTenant() }))
    expect(html).toContain('Get started')
    // Pin the per-step derivation, not just the labels: a hot+provisioned hub marks
    // "Hub running" done, while a did-less tenant leaves "Connect a device" pending.
    expect(html).toMatch(/<li class="done">[\s\S]*?Hub running/)
    expect(html).toMatch(/<li class="">[\s\S]*?Connect a device/)
  })

  it('marks "Hub running" pending for a cold (sleeping) hub', () => {
    // hubUrl is kept non-empty so this isolates the `&& dataTier === 'hot'` guard.
    const html = renderDashboard(baseView({ tenant: { ...unconnectedTenant(), dataTier: 'cold' } }))
    expect(html).toContain('Get started')
    expect(html).toMatch(/<li class="">[\s\S]*?Hub running/)
    // …and the hub card reflects the sleeping state.
    expect(html).toContain('Sleeping')
  })

  it('vanishes once a device is connected (even if the hub later sleeps)', () => {
    const html = renderDashboard(baseView({ tenant: connectedTenant() }))
    expect(html).not.toContain('Get started')
    // A connected tenant whose hub went cold must NOT resurrect the checklist.
    const slept = renderDashboard(
      baseView({ tenant: { ...connectedTenant(), dataTier: 'cold', hubUrl: '' } })
    )
    expect(slept).not.toContain('Get started')
  })

  it('is suppressed when the user has dismissed it via cookie', () => {
    const html = renderDashboard(
      baseView({ tenant: unconnectedTenant(), gettingStartedHidden: true })
    )
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
    const html = renderDashboard(
      baseView({ tenant: null, marketingUrl: 'https://staging.example/cloud' })
    )
    expect(html).toContain('href="https://staging.example/cloud/pricing#faq"')
    expect(html).toContain('href="https://staging.example/docs/guides/cloud-connect"')
  })

  it('strips a trailing slash so links never double up', () => {
    const html = renderDashboard(
      baseView({ tenant: null, marketingUrl: 'https://xnet.fyi/cloud/' })
    )
    expect(html).toContain('href="https://xnet.fyi/cloud/pricing#faq"')
    expect(html).not.toContain('cloud//pricing')
  })
})

describe('dashboard — "Open web app" pins the personal hub', () => {
  it('appends the tenant hub (https→wss) to the header + connect links', () => {
    const html = renderDashboard(
      baseView({ tenant: { ...connectedTenant(), hubUrl: 'https://t-abc.hub.xnet.fyi' } })
    )
    // The header "Open web app" button carries the personal hub as a wss param.
    expect(html).toContain('href="https://app.example/app?hub=wss%3A%2F%2Ft-abc.hub.xnet.fyi"')
  })

  it('pins the hub on the connect-card "Open the web app" link for an unconnected tenant', () => {
    const html = renderDashboard(
      baseView({ tenant: { ...unconnectedTenant(), hubUrl: 'https://t-xyz.hub.xnet.fyi' } })
    )
    expect(html).toContain('?hub=wss%3A%2F%2Ft-xyz.hub.xnet.fyi')
    // both the header button and the in-card "Open the web app ↗" link carry it
    expect(
      (html.match(/\?hub=wss%3A%2F%2Ft-xyz\.hub\.xnet\.fyi/g) || []).length
    ).toBeGreaterThanOrEqual(2)
  })

  it('passes a wss hubUrl through unchanged', () => {
    const html = renderDashboard(
      baseView({ tenant: { ...connectedTenant(), hubUrl: 'wss://already.example' } })
    )
    expect(html).toContain('?hub=wss%3A%2F%2Falready.example')
  })

  it('uses the bare app URL when the hub is suspended/sleeping (no hubUrl)', () => {
    const html = renderDashboard(
      baseView({ tenant: { ...connectedTenant(), dataTier: 'cold', hubUrl: '' } })
    )
    expect(html).toContain('href="https://app.example/app"')
    expect(html).not.toContain('?hub=')
  })

  it('does not add a hub param on the tenantless welcome screen', () => {
    const html = renderDashboard(baseView({ tenant: null }))
    expect(html).toContain('href="https://app.example/app"')
    expect(html).not.toContain('?hub=')
  })
})
