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
import { sloForPlan } from './observability/slo'

export interface DashboardView {
  billingUserId: string
  email?: string
  tenant: TenantRecord | null
  /** Plans offered for self-serve checkout (excludes free demo + contract enterprise). */
  checkoutPlans: { id: PlanId; label: string; price: string }[]
  /** Whether checkout/portal are wired (a billing gateway is configured). */
  billingEnabled: boolean
  /** Base URL of the hosted web app ("Open the app"). */
  appUrl?: string
  /** Managed-AI spend for the current billing period (from the usage ledger). */
  aiUsage?: { usedUsd: number; includedUsd: number; budgetUsd: number }
}

const usd = (n: number): string => `$${n.toFixed(2)}`

/** A meter showing AI spend vs the included amount and the hard cap. */
function aiUsageCard(view: DashboardView, tenant: TenantRecord): string {
  if (!tenant.entitlements.aiEnabled) return ''
  const u = view.aiUsage ?? {
    usedUsd: 0,
    includedUsd: tenant.entitlements.includedAiUsd,
    budgetUsd: tenant.entitlements.aiMonthlyBudgetUsd
  }
  const pct = u.budgetUsd > 0 ? Math.min(100, Math.round((u.usedUsd / u.budgetUsd) * 100)) : 0
  const includedPct = u.budgetUsd > 0 ? Math.min(100, (u.includedUsd / u.budgetUsd) * 100) : 0
  const overIncluded = u.usedUsd > u.includedUsd
  const near = pct >= 80
  const fill = near ? '#fbbf24' : '#4f46e5'
  const overageNote = overIncluded
    ? `<p class="muted">You're past the included ${usd(u.includedUsd)} — extra usage is metered to your card up to the ${usd(u.budgetUsd)} cap.</p>`
    : `<p class="muted">${usd(u.includedUsd)} of AI is included each month; a hard ${usd(u.budgetUsd)} cap prevents surprise bills.</p>`
  return `
    <div class="card">
      <h2>Managed AI</h2>
      <div class="meter" title="${usd(u.usedUsd)} of ${usd(u.budgetUsd)} used">
        <div class="meter-fill" style="width:${pct}%;background:${fill}"></div>
        <div class="meter-included" style="left:${includedPct}%" title="included ${usd(u.includedUsd)}"></div>
      </div>
      <div class="meter-legend">
        <span><strong>${usd(u.usedUsd)}</strong> used this month</span>
        <span class="muted">included ${usd(u.includedUsd)} · cap ${usd(u.budgetUsd)}</span>
      </div>
      ${overageNote}
    </div>`
}

/** Let an existing tenant switch plans (an in-tier flip applies live; a tier change migrates). */
function planChangeCard(view: DashboardView, tenant: TenantRecord): string {
  if (!view.billingEnabled) return ''
  const options = view.checkoutPlans
    .filter((p) => p.id !== tenant.plan)
    .map(
      (p) => `
      <form method="post" action="/account/plan" class="plan">
        <input type="hidden" name="plan" value="${esc(p.id)}" />
        <div class="plan-name">${esc(p.label)}</div>
        <div class="plan-price">${esc(p.price)}</div>
        <button type="submit" class="ghost">Switch</button>
      </form>`
    )
    .join('')
  if (!options) return ''
  return `
    <div class="card">
      <h2>Change plan</h2>
      <p class="muted">You're on <strong>${esc(tenant.plan)}</strong>. Switching within the same tier applies instantly; a bigger change may move your data.</p>
      <div class="plans">${options}</div>
    </div>`
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
  // Live tiles are hydrated by pollLive() from /dashboard/live.json; the server
  // render seeds them with placeholders so the card is useful even before the
  // first poll (and if JS is off, the static dl below still tells the full story).
  const live =
    tenant.dataTier === 'hot' && tenant.subscriptionStatus !== 'canceled'
      ? `
      <div class="tiles" id="live-tiles">
        <div class="tile"><span class="tile-val" id="t-conns">—</span><span class="tile-lbl">connections</span></div>
        <div class="tile"><span class="tile-val" id="t-docs">—</span><span class="tile-lbl">documents</span></div>
        <div class="tile"><span class="tile-val" id="t-rooms">—</span><span class="tile-lbl">rooms</span></div>
        <div class="tile"><span class="tile-val" id="t-latency">—</span><span class="tile-lbl">p95 latency</span></div>
        <div class="tile"><span class="tile-val" id="t-uptime">—</span><span class="tile-lbl">uptime (SLA window)</span></div>
        <div class="tile"><span class="tile-val" id="t-mem">—</span><span class="tile-lbl">memory</span></div>
      </div>
      <div class="spark">
        <svg id="spark-svg" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
          <polyline id="spark-line" fill="none" stroke="#4f46e5" stroke-width="2" points="" />
        </svg>
        <span class="muted spark-lbl">live connections · last <span id="spark-n">0</span> samples</span>
      </div>
      <div class="budget" id="budget-wrap" hidden>
        <div class="budget-bar"><div class="budget-fill" id="budget-fill"></div></div>
        <span class="muted" id="budget-lbl"></span>
      </div>`
      : ''
  return `
    <div class="card">
      <h2>Your hub <span id="live-status">${status}</span></h2>
      ${live}
      <dl>
        <div><dt>Plan</dt><dd>${esc(tenant.plan)}</dd></div>
        <div><dt>Endpoint</dt><dd>${reach}</dd></div>
        <div><dt>Region</dt><dd><span id="t-region">${esc(tenant.region || 'auto')}</span></dd></div>
        <div><dt>Version</dt><dd><span id="t-version">${esc(tenant.targetVersion || '—')}</span></dd></div>
        <div><dt>Storage quota</dt><dd>${fmtBytes(e.quotaBytes)}</dd></div>
        <div><dt>Seats</dt><dd>${e.seats}</dd></div>
        <div><dt>SLA</dt><dd>${esc(sloForPlan(tenant.plan).label)}</dd></div>
        <div><dt>Backups</dt><dd>Continuous → R2 object storage</dd></div>
        <div><dt>Data identity</dt><dd>${
          tenant.did
            ? `<code>${esc(tenant.did)}</code>`
            : `<span class="muted">not yet connected</span>`
        }</dd></div>
      </dl>
    </div>`
}

/**
 * Client-side hydration: poll the live endpoint and update the hub tiles. Vanilla
 * JS (no bundle) — re-renders status, connections, docs, rooms, uptime%, region,
 * version every 10s. Degrades silently if the endpoint is unreachable.
 */
function liveScript(): string {
  return `<script>
(function(){
  var elTiles = document.getElementById('live-tiles');
  if (!elTiles) return;
  var MAX = 30, hist = [];
  function set(id, v){ var el = document.getElementById(id); if (el && v != null) el.textContent = v; }
  function badge(state){
    var cls = state === 'active' ? 'badge-ok' : 'badge-warn';
    var label = state === 'active' ? 'Active' : state === 'sleeping' ? 'Sleeping' : 'Suspended';
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }
  function mb(bytes){ return bytes != null ? Math.round(bytes / 1048576) + ' MB' : '—'; }
  function spark(){
    var line = document.getElementById('spark-line');
    if (!line || !hist.length) return;
    var max = Math.max(1, Math.max.apply(null, hist));
    var pts = hist.map(function(v, i){
      var x = hist.length > 1 ? (i / (hist.length - 1)) * 300 : 0;
      var y = 38 - (v / max) * 36;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    line.setAttribute('points', pts);
    set('spark-n', String(hist.length));
  }
  function budget(d){
    var wrap = document.getElementById('budget-wrap');
    if (!wrap || d.errorBudgetPct == null) return;
    wrap.hidden = false;
    var fill = document.getElementById('budget-fill');
    var color = d.errorBudgetPolicy === 'freeze' ? '#ef4444' : d.errorBudgetPolicy === 'caution' ? '#fbbf24' : '#10b981';
    fill.style.width = Math.max(0, Math.min(100, d.errorBudgetPct)) + '%';
    fill.style.background = color;
    set('budget-lbl', 'error budget ' + d.errorBudgetPct + '% · ' + (d.sloLabel || ''));
  }
  async function tick(){
    try {
      var r = await fetch('/dashboard/live.json', { headers: { 'accept': 'application/json' } });
      if (!r.ok) return;
      var d = await r.json();
      var st = document.getElementById('live-status'); if (st) st.innerHTML = badge(d.state);
      set('t-conns', d.connections ? (d.connections.active + ' / ' + d.connections.max) : (d.reachable ? '0' : '—'));
      set('t-docs', d.docs ? d.docs.total : '—');
      set('t-rooms', d.rooms != null ? d.rooms : '—');
      set('t-latency', d.p95LatencyMs != null ? d.p95LatencyMs + ' ms' : '—');
      set('t-uptime', d.uptimePct != null ? d.uptimePct + '%' : '—');
      set('t-mem', mb(d.memoryRssBytes));
      set('t-region', d.region);
      set('t-version', d.version);
      if (d.connections) { hist.push(d.connections.active); if (hist.length > MAX) hist.shift(); spark(); }
      budget(d);
    } catch (e) {}
  }
  tick();
  setInterval(tick, 10000);
})();
</script>`
}

function connectCard(tenant: TenantRecord, appUrl: string): string {
  if (tenant.did) {
    return `
      <div class="card">
        <h2>Connected</h2>
        <p class="muted">Your app is connected to this hub. Open xNet on any device and sign in with your passkey.</p>
        <a class="btn" href="${esc(appUrl)}" target="_blank" rel="noopener">Open the app</a>
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
  .meter { position: relative; height: 12px; background: #1c1c24; border-radius: 999px; overflow: hidden; margin-bottom: 10px; }
  .meter-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
  .meter-included { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #6b7280; }
  .meter-legend { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .tile { background: #0d0d12; border: 1px solid #1f1f27; border-radius: 10px; padding: 12px 14px; text-align: center; }
  .tile-val { display: block; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tile-lbl { display: block; color: #9ca3af; font-size: 12px; margin-top: 2px; }
  .spark { margin-bottom: 16px; }
  .spark svg { width: 100%; height: 40px; display: block; background: #0d0d12; border: 1px solid #1f1f27; border-radius: 10px; }
  .spark-lbl { display: block; font-size: 12px; margin-top: 6px; }
  .budget { margin-bottom: 16px; }
  .budget-bar { height: 8px; background: #1c1c24; border-radius: 999px; overflow: hidden; margin-bottom: 6px; }
  .budget-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
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
  const appUrl = view.appUrl ?? 'https://xnet.fyi/app'
  const body = view.tenant
    ? `${hubCard(view.tenant)}${aiUsageCard(view, view.tenant)}${connectCard(view.tenant, appUrl)}${planChangeCard(view, view.tenant)}${billingCard(view, view.tenant)}${dangerZone()}${liveScript()}`
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

/** Shown when a plan change crosses an isolation tier and needs a data migration. */
export function renderPlanChangeNotice(opts: { who: string; from: PlanId; to: PlanId }): string {
  return page(
    'xNet Cloud — Plan change',
    opts.who,
    `<h1>Plan change</h1>
     <div class="card">
       <h2>Moving ${esc(opts.from)} → ${esc(opts.to)} needs a migration</h2>
       <p class="muted">This change crosses hosting tiers, so we move your data to new
       infrastructure rather than flipping it live. We'll email you to schedule it with
       zero data loss; nothing has changed yet.</p>
       <a class="btn" href="/dashboard">Back to dashboard</a>
     </div>`
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
