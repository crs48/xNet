/**
 * xNet Cloud — the authenticated dashboard (server-rendered HTML).
 *
 * Served same-origin by the control plane so the sealed session cookie is read
 * without CORS (exploration 0192's Option 2). Deliberately a small HTML string,
 * not a second React bundle — it manages the *custodial* side (plan, hub status,
 * billing, danger zone); the *data/sovereign* side (connect hub, delete data DID)
 * lives in the app.
 */

import type { TenantRecord } from './registry'
import type { PlanId } from '@xnetjs/entitlements'

export interface DashboardView {
  billingUserId: string
  email?: string
  tenant: TenantRecord | null
  /** Plans offered for self-serve checkout (excludes free demo + contract enterprise). */
  checkoutPlans: { id: PlanId; label: string; price: string }[]
  /** Whether checkout/portal are wired (a billing gateway is configured). */
  billingEnabled: boolean
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )

const GiB = 1024 * 1024 * 1024
const MiB = 1024 * 1024
const fmtBytes = (n: number): string =>
  n >= GiB ? `${Math.round(n / GiB)} GiB` : `${Math.round(n / MiB)} MiB`

function planPicker(view: DashboardView): string {
  if (!view.billingEnabled) {
    return `<p class="muted">Billing isn't configured on this control plane yet.</p>`
  }
  const cards = view.checkoutPlans
    .map(
      (p) => `
      <form method="post" action="/checkout" class="plan">
        <input type="hidden" name="plan" value="${esc(p.id)}" />
        <div class="plan-name">${esc(p.label)}</div>
        <div class="plan-price">${esc(p.price)}</div>
        <button type="submit">Choose ${esc(p.label)}</button>
      </form>`
    )
    .join('')
  return `<div class="plans">${cards}</div>`
}

function hubCard(tenant: TenantRecord): string {
  const status =
    tenant.subscriptionStatus === 'canceled'
      ? `<span class="badge badge-warn">Canceled — suspended</span>`
      : tenant.dataTier === 'cold'
        ? `<span class="badge badge-warn">Sleeping</span>`
        : `<span class="badge badge-ok">Active</span>`
  const reach = tenant.hubUrl
    ? `<code>${esc(tenant.hubUrl)}</code>`
    : `<span class="muted">suspended — re-subscribe to wake it</span>`
  const e = tenant.entitlements
  return `
    <div class="card">
      <h2>Your hub ${status}</h2>
      <dl>
        <div><dt>Plan</dt><dd>${esc(tenant.plan)}</dd></div>
        <div><dt>Endpoint</dt><dd>${reach}</dd></div>
        <div><dt>Region</dt><dd>${esc(tenant.region || 'auto')}</dd></div>
        <div><dt>Storage</dt><dd>${fmtBytes(e.quotaBytes)}</dd></div>
        <div><dt>Seats</dt><dd>${e.seats}</dd></div>
        <div><dt>Data identity</dt><dd>${
          tenant.did
            ? `<code>${esc(tenant.did)}</code>`
            : `<span class="muted">not yet connected</span>`
        }</dd></div>
      </dl>
    </div>`
}

function connectCard(tenant: TenantRecord): string {
  if (tenant.did) {
    return `
      <div class="card">
        <h2>Connected</h2>
        <p class="muted">Your app is connected to this hub. Open xNet on any device and sign in with your passkey.</p>
        <a class="btn" href="/app" target="_blank" rel="noopener">Open the app</a>
      </div>`
  }
  return `
    <div class="card">
      <h2>Connect your app</h2>
      <ol>
        <li>Open xNet on web, desktop, or mobile.</li>
        <li>Create your passkey (this is your data identity — it never leaves your device).</li>
        <li>Choose <strong>Connect xNet Cloud hub</strong> and approve the code here.</li>
      </ol>
      <a class="btn" href="/claim">Approve a device</a>
    </div>`
}

function billingCard(view: DashboardView, tenant: TenantRecord): string {
  if (!view.billingEnabled) return ''
  const portal =
    tenant.subscriptionStatus === 'canceled'
      ? `<p class="muted">Your subscription is canceled.</p>`
      : `<form method="post" action="/portal"><button type="submit">Manage billing</button></form>`
  return `
    <div class="card">
      <h2>Billing</h2>
      ${portal}
    </div>`
}

function dangerZone(): string {
  return `
    <div class="card danger">
      <h2>Danger zone</h2>
      <p class="muted">
        <strong>Cancel subscription</strong> stops billing and suspends your hub; your
        encrypted backup is retained so you can re-subscribe or export.
        <strong>Delete my data</strong> destroys the hub and its backup — this is
        irreversible, and not even we can recover it (we only ever hold encrypted bytes).
      </p>
      <div class="danger-actions">
        <form method="post" action="/portal"><button type="submit" class="ghost">Cancel subscription</button></form>
        <form method="post" action="/account/delete-data" onsubmit="return confirm('Permanently delete your hub and all its data? This cannot be undone.')">
          <button type="submit" class="destructive">Delete my data</button>
        </form>
      </div>
    </div>`
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0f; color: #e5e7eb; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 24px 80px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 28px; }
  header .brand { font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
  header .who { color: #9ca3af; font-size: 13px; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 0 0 14px; }
  .lead { color: #9ca3af; margin: 0 0 28px; }
  .card { border: 1px solid #23232b; background: #121218; border-radius: 14px; padding: 22px; margin-bottom: 18px; }
  .card.danger { border-color: rgba(239,68,68,0.3); }
  dl { margin: 0; display: grid; gap: 10px; }
  dl > div { display: flex; justify-content: space-between; gap: 12px; }
  dt { color: #9ca3af; } dd { margin: 0; text-align: right; font-weight: 500; }
  code { background: #1c1c24; padding: 2px 6px; border-radius: 6px; font-size: 13px; word-break: break-all; }
  .muted { color: #9ca3af; font-size: 14px; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .badge-ok { background: rgba(16,185,129,0.15); color: #34d399; }
  .badge-warn { background: rgba(245,158,11,0.15); color: #fbbf24; }
  button, .btn { display: inline-block; background: #4f46e5; color: #fff; border: 0; border-radius: 9px; padding: 9px 16px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
  button:hover, .btn:hover { background: #6366f1; }
  button.ghost { background: transparent; border: 1px solid #3a3a44; color: #c7c7d1; }
  button.destructive { background: #b91c1c; }
  button.destructive:hover { background: #dc2626; }
  .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .plan { border: 1px solid #23232b; border-radius: 12px; padding: 16px; text-align: center; }
  .plan-name { font-weight: 600; } .plan-price { color: #9ca3af; font-size: 13px; margin: 4px 0 12px; }
  .danger-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  ol { margin: 0 0 16px; padding-left: 20px; } ol li { margin-bottom: 6px; }
`

/** Wrap inner HTML in the shared dark-themed document chrome. */
function page(title: string, who: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head><body><div class="wrap">
  <header>
    <span class="brand">xNet Cloud</span>
    <span class="who">${esc(who)} · <a href="/logout" style="color:#9ca3af">Sign out</a></span>
  </header>
  ${inner}
</div></body></html>`
}

/** Render the full dashboard HTML document. */
export function renderDashboard(view: DashboardView): string {
  const who = view.email ?? view.billingUserId
  const body = view.tenant
    ? `${hubCard(view.tenant)}${connectCard(view.tenant)}${billingCard(view, view.tenant)}${dangerZone()}`
    : `<div class="card">
         <h2>Welcome to xNet Cloud</h2>
         <p class="muted">Pick a plan to spin up your dedicated hub. You can change or cancel any time.</p>
         ${planPicker(view)}
       </div>`
  return page(
    'xNet Cloud — Dashboard',
    who,
    `<h1>Dashboard</h1>
     <p class="lead">Manage your managed hub, billing, and data.</p>
     ${body}`
  )
}

/** Render the device-grant approval form (the dashboard side of "claim your hub"). */
export function renderClaimForm(opts: { who: string; prefill?: string; error?: string }): string {
  const err = opts.error ? `<p style="color:#fbbf24">${esc(opts.error)}</p>` : ''
  return page(
    'xNet Cloud — Connect a device',
    opts.who,
    `<h1>Connect a device</h1>
     <p class="lead">Enter the code shown in your xNet app to link it to your hub.</p>
     <div class="card">
       ${err}
       <form method="post" action="/claim">
         <label style="display:block;margin-bottom:10px;color:#9ca3af;font-size:14px">Device code</label>
         <input name="userCode" value="${esc(opts.prefill ?? '')}" placeholder="ABCD-7K2P" autocapitalize="characters" autocomplete="off"
           style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid #2a2a33;background:#0d0d12;color:#e5e7eb;font-size:16px;letter-spacing:0.1em;margin-bottom:14px" />
         <button type="submit">Approve device</button>
       </form>
     </div>`
  )
}

/** Render the result after approving (or failing to find) a device code. */
export function renderClaimResult(opts: { who: string; ok: boolean }): string {
  const inner = opts.ok
    ? `<div class="card">
         <h2>Device approved <span class="badge badge-ok">Done</span></h2>
         <p class="muted">Return to your xNet app — it will finish connecting to your hub automatically.</p>
         <a class="btn" href="/dashboard">Back to dashboard</a>
       </div>`
    : `<div class="card">
         <h2>Code not found</h2>
         <p class="muted">That code is unknown or has expired. Restart the connection from your app and try again.</p>
         <a class="btn" href="/claim">Try again</a>
       </div>`
  return page('xNet Cloud — Connect a device', opts.who, `<h1>Connect a device</h1>${inner}`)
}
