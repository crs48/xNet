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
import { isSeatMetered } from '@xnetjs/entitlements'
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
  /** Marketing/docs base ("https://xnet.fyi/cloud") — drives the help + FAQ links. */
  marketingUrl?: string
  /** Managed-AI spend for the current billing period (from the usage ledger). */
  aiUsage?: { usedUsd: number; includedUsd: number; budgetUsd: number }
  /** When true, the user has dismissed the getting-started checklist (a cookie). */
  gettingStartedHidden?: boolean
}

/** Help/FAQ/doc destinations derived from the marketing base URL. */
interface HelpLinks {
  cloud: string
  faq: string
  connect: string
  selfhost: string
  status: string
}

/**
 * Derive the help links from the configured marketing URL (default
 * `https://xnet.fyi/cloud`). The FAQ lives under the cloud path; the guides and
 * status live at the site origin. Falls back to the public site if the URL is
 * misconfigured (e.g. a bare `/`), so links never render relative/broken.
 */
function helpLinks(marketingUrl: string): HelpLinks {
  let base: URL | null = null
  try {
    base = new URL(marketingUrl)
  } catch {
    base = null
  }
  const origin = base ? base.origin : 'https://xnet.fyi'
  const cloud = base ? base.href.replace(/\/$/, '') : `${origin}/cloud`
  return {
    cloud,
    faq: `${cloud}/pricing#faq`,
    connect: `${origin}/docs/guides/cloud-connect`,
    selfhost: `${origin}/docs/guides/hub`,
    status: `${origin}/status`
  }
}

/** A titled card shell — used by the newer guided-connect/checklist sections. */
function card(title: string, inner: string, extraClass = ''): string {
  return `
    <div class="card${extraClass ? ` ${extraClass}` : ''}">
      <h2>${esc(title)}</h2>
      ${inner}
    </div>`
}

/** A copyable inline value: `<code>` + a Copy button wired by `dashScript()`. */
function copyField(id: string, value: string): string {
  return `<span class="copy"><code id="${esc(id)}">${esc(value)}</code><button type="button" class="ghost btn-sm" data-copy="${esc(id)}">Copy</button></span>`
}

/** xNet-owned hosts a managed hub lives on — matches the desktop app's allowlist. */
const DEEP_LINK_HUB_HOSTS = ['xnet.fyi', 'xnet.app']

/**
 * Build the `xnet://connect` deep link for the desktop "Open in desktop app"
 * button, or null when the hub can't be one-click-connected. We only emit a link
 * the desktop app will actually accept: it requires `wss://` on an allowlisted
 * xNet host, so we normalize the stored (https) hub URL to wss and gate on the
 * same allowlist. A hub off those domains (e.g. a staging `*.run.app`) returns
 * null, so the dashboard falls back to the copy-paste steps instead of offering a
 * button that the desktop app would silently reject.
 */
function desktopConnectHref(hubUrl: string): string | null {
  // Normalize the stored (https) hub to a secure WebSocket URL and drop any lone
  // trailing slash so the link matches the canonical `wss://host` form.
  const candidate = hubUrl
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:')
    .replace(/\/+$/, '')
  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    return null
  }
  if (u.protocol !== 'wss:' || u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  const allowed = DEEP_LINK_HUB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (!allowed) return null
  return `xnet://connect?hub=${encodeURIComponent(candidate)}`
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
      ${aiBudgetForm(tenant)}
    </div>`
}

/** Self-serve spend-cap control: amount + window, posted to `/account/ai-budget` (0244). */
function aiBudgetForm(tenant: TenantRecord): string {
  const planCap = tenant.entitlements.aiMonthlyBudgetUsd
  const cap = tenant.aiBudget?.capUsd
  const win = tenant.aiBudget?.window
  const kind = win?.kind ?? 'calendar-month'
  const rollingDays = win?.kind === 'rolling' ? win.days : 7
  const opt = (value: string, label: string): string =>
    `<option value="${value}"${kind === value ? ' selected' : ''}>${label}</option>`
  return `
      <form method="post" action="/account/ai-budget" class="ai-budget">
        <label>Your spend cap (USD)
          <input type="number" name="cap" min="0" step="0.01" value="${cap ?? ''}" placeholder="up to ${usd(planCap)}" />
        </label>
        <label>resets
          <select name="window">
            ${opt('calendar-month', 'monthly')}
            ${opt('calendar-week', 'weekly')}
            ${opt('rolling', 'rolling days')}
          </select>
        </label>
        <input type="number" name="rollingDays" min="1" step="1" value="${rollingDays}" aria-label="rolling window length in days" />
        <button type="submit" class="ghost">Save cap</button>
      </form>
      <p class="muted">Set your own limit (≤ the ${usd(planCap)} plan cap); we stop calls when you reach it and it resets each window. Leave blank to use the full plan cap.</p>`
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
      <p class="muted">You're on <strong>${esc(tenant.plan)}</strong>. Upgrading applies instantly — your data just gets more room. Switching to a smaller plan needs your data to fit; if it doesn't, we'll show you how to free space or start fresh.</p>
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
    ? copyField('endpoint-url', tenant.hubUrl)
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
      <div class="budget" id="storage-wrap" hidden>
        <div class="budget-bar"><div class="budget-fill" id="storage-fill"></div></div>
        <span class="muted" id="storage-lbl"></span>
      </div>
      <p class="overquota-note" id="overquota-note" hidden></p>
      <p class="muted" id="backup-lbl" style="margin:0 0 4px">Backups: continuous → R2 object storage</p>
      <div class="budget" id="budget-wrap" hidden>
        <div class="budget-bar"><div class="budget-fill" id="budget-fill"></div></div>
        <span class="muted" id="budget-lbl"></span>
      </div>
      <div id="diag-wrap" hidden>
        <p class="muted" id="diag-lbl" style="margin:8px 0 4px"></p>
        <ul id="diag-issues" class="diag-issues"></ul>
        <p class="muted" style="margin:2px 0 0;font-size:12px">Crash reports live on <em>your</em> hub — this is a window, not a copy. Triage them in the app: Settings → Privacy &amp; Diagnostics → Import reports.</p>
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
        <div><dt>Seats</dt><dd>${isSeatMetered(e) ? e.seats : 'Unlimited members'}</dd></div>
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
  function fmtBytes(b){
    if (b == null) return '—';
    var g = 1073741824, m = 1048576, k = 1024;
    return b >= g ? (b/g).toFixed(1) + ' GB' : b >= m ? Math.round(b/m) + ' MB' : b >= k ? Math.round(b/k) + ' KB' : b + ' B';
  }
  function rel(ms){
    if (ms == null) return 'never';
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return s + 's ago';
    var mm = Math.round(s / 60); if (mm < 60) return mm + 'm ago';
    var h = Math.round(mm / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  function storage(d){
    var wrap = document.getElementById('storage-wrap');
    if (wrap && d.storagePct != null) {
      wrap.hidden = false;
      var f = document.getElementById('storage-fill');
      f.style.width = d.storagePct + '%';
      f.style.background = d.storagePct >= 90 ? '#ef4444' : d.storagePct >= 70 ? '#fbbf24' : '#4f46e5';
      set('storage-lbl', 'storage ' + fmtBytes(d.storageUsedBytes) + ' / ' + fmtBytes(d.storageQuotaBytes) + ' (' + d.storagePct + '%)');
    }
    var oq = document.getElementById('overquota-note');
    if (oq) {
      oq.hidden = !d.overQuota;
      if (d.overQuota) oq.textContent = "You're over your plan's storage. Your data is safe, but new writes are paused until you free up space or upgrade.";
    }
    var bl = document.getElementById('backup-lbl');
    if (bl && d.backup) {
      // Prefer the confirmed R2 sync time ("data safe as of") when the hub reports
      // it; fall back to newest-write ("data as of") for older hubs (exploration 0288).
      var safeAt = d.backup.lastSyncMs != null
        ? 'data safe as of ' + rel(d.backup.lastSyncMs)
        : 'data as of ' + rel(d.backup.lastWriteMs);
      bl.textContent = (d.backup.replicating ? 'Backed up to R2 ✓ · ' : 'Backups off · ') + safeAt;
    }
  }
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
  function esc(s){ var el = document.createElement('span'); el.textContent = String(s); return el.innerHTML; }
  function diagnostics(d){
    var wrap = document.getElementById('diag-wrap');
    if (!wrap) return;
    var g = d.diagnostics;
    // Only show the section when the hub reports an inbox (older hubs: absent).
    if (!g) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var lbl = g.pending > 0
      ? 'Diagnostics: ' + g.pending + ' report' + (g.pending === 1 ? '' : 's') + ' awaiting triage' + (g.lastSeenMs != null ? ' · last seen ' + rel(g.lastSeenMs) : '')
      : 'Diagnostics: no reports awaiting triage';
    set('diag-lbl', lbl);
    var ul = document.getElementById('diag-issues');
    if (ul) {
      ul.innerHTML = (g.topIssues || []).slice(0, 3).map(function(issue){
        return '<li><code>' + esc(issue.shortId) + '</code> ' + esc(issue.errorName)
          + ' — seen ' + issue.occurrences + '\\u00d7'
          + (issue.release ? ' in ' + esc(issue.release) : '') + '</li>';
      }).join('');
    }
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
      storage(d);
      budget(d);
      diagnostics(d);
    } catch (e) {}
  }
  tick();
  setInterval(tick, 10000);
})();
</script>`
}

/**
 * Per-platform "connect your apps" guidance. The connect machinery (device-grant
 * claim) is identical across platforms, but *where you start it* differs — so we
 * tab Web / Desktop / Mobile and tailor the steps. Progressive enhancement: the tab
 * bar is `hidden` until `dashScript()` reveals it, and the panels render unhidden,
 * so with JS off all three stacked panels (each with its own heading) stay readable.
 */
function connectCard(tenant: TenantRecord, appUrl: string, links: HelpLinks): string {
  // A canceled tenant's hub is torn down — the hub + billing cards already explain
  // the suspension, so we don't show connect guidance (it would contradict them).
  if (tenant.subscriptionStatus === 'canceled') return ''
  // Once a device is bound, the app is connected; the hub may be asleep (cold), in
  // which case opening the app wakes it rather than "picking up" from a live endpoint.
  if (tenant.did) {
    const sleeping = !tenant.hubUrl || tenant.dataTier !== 'hot'
    const blurb = sleeping
      ? 'Your hub is asleep. Open xNet on any device and it wakes automatically to pick up your data.'
      : 'Your app is connected to this hub. Open xNet on any device and sign in with your passkey to pick up your data.'
    return card(
      'Connected',
      `<p class="muted">${blurb}</p>
       <a class="btn" href="${esc(appUrl)}" target="_blank" rel="noopener">Open the app ↗</a>`
    )
  }
  const hubField = tenant.hubUrl
    ? copyField('hub-url', tenant.hubUrl)
    : `<span class="muted">your hub URL appears here once it finishes provisioning</span>`
  // One-click desktop handoff (xnet://connect): only when the hub is on an
  // allowlisted xNet host the desktop app will accept; otherwise the copy-paste
  // steps below are the path.
  const deepLink = tenant.hubUrl ? desktopConnectHref(tenant.hubUrl) : null
  const oneClick = deepLink
    ? `<p><a class="btn btn-sm" href="${esc(deepLink)}">Open in desktop app</a></p>
       <p class="muted note">We'll ask you to confirm in the app before connecting — it never repoints itself silently. Don't have the desktop app yet? Set it manually:</p>`
    : ''
  return card(
    'Connect your apps',
    `<p class="muted">Link a device to start syncing. Pick where you're connecting from:</p>
     <div class="tabs" data-tabs role="tablist" hidden>
       <button type="button" id="tab-web" class="tab" data-tab="web" role="tab" aria-controls="panel-web" aria-selected="true">🌐 Web</button>
       <button type="button" id="tab-desktop" class="tab" data-tab="desktop" role="tab" aria-controls="panel-desktop" aria-selected="false">🖥️ Desktop</button>
       <button type="button" id="tab-mobile" class="tab" data-tab="mobile" role="tab" aria-controls="panel-mobile" aria-selected="false">📱 Mobile</button>
     </div>
     <section class="tabpanel" id="panel-web" data-panel="web" role="tabpanel" aria-labelledby="tab-web" tabindex="0">
       <h3 class="panel-h">On the web</h3>
       <ol>
         <li><a class="btn btn-sm" href="${esc(appUrl)}" target="_blank" rel="noopener">Open the web app ↗</a></li>
         <li>Create your passkey when prompted — your data identity, which never leaves your device.</li>
         <li>Choose <strong>Connect xNet Cloud hub</strong>; the app shows a short code.</li>
         <li><a class="btn btn-sm ghost" href="/claim">Enter that code here →</a></li>
       </ol>
     </section>
     <section class="tabpanel" id="panel-desktop" data-panel="desktop" role="tabpanel" aria-labelledby="tab-desktop" tabindex="0">
       <h3 class="panel-h">On desktop</h3>
       ${oneClick}
       <ol>
         <li>Open the xNet desktop app and go to <strong>Settings → Network</strong>.</li>
         <li>Paste this hub URL into the <strong>Signaling server</strong> field: ${hubField}</li>
         <li>Restart the app, then create your passkey and approve the code: <a class="btn btn-sm ghost" href="/claim">Enter a code →</a></li>
       </ol>
     </section>
     <section class="tabpanel" id="panel-mobile" data-panel="mobile" role="tabpanel" aria-labelledby="tab-mobile" tabindex="0">
       <h3 class="panel-h">On mobile</h3>
       <ol>
         <li>Install xNet on your phone and open it.</li>
         <li>Create your passkey, then choose <strong>Connect xNet Cloud hub</strong>.</li>
         <li>Approve the code it shows here: <a class="btn btn-sm ghost" href="/claim">Enter a code →</a></li>
       </ol>
     </section>
     <p class="muted help-row">Stuck? <a href="${esc(links.connect)}" target="_blank" rel="noopener">How to connect</a> · <a href="${esc(links.faq)}" target="_blank" rel="noopener">FAQ</a></p>`
  )
}

/**
 * A getting-started checklist for the just-subscribed tenant — Vercel-style
 * activation. Steps are *derived from tenant state*, so the list self-completes and
 * vanishes once a device is connected; a cookie also lets the user hide it early
 * (handy for desktop "paste-URL" users whose binding we may not have observed yet).
 */
function gettingStarted(view: DashboardView): string {
  const t = view.tenant
  if (!t || view.gettingStartedHidden) return ''
  // Activation is a one-way funnel. Once a device is bound (`did`), onboarding is
  // done for good — don't resurrect the checklist if the hub later sleeps or the
  // sub is canceled (when `hubUrl`/`dataTier` flip but `did` stays set). And a
  // canceled tenant isn't onboarding at all; the hub + billing cards cover that.
  if (t.did || t.subscriptionStatus === 'canceled') return ''
  const steps = [
    { done: true, label: 'Plan chosen', hint: 'Your dedicated hub is provisioned.' },
    {
      done: Boolean(t.hubUrl) && t.dataTier === 'hot',
      label: 'Hub running',
      hint: 'A reachable sync endpoint is live.'
    },
    { done: false, label: 'Connect a device', hint: 'Approve an app with a passkey and code.' }
  ]
  const items = steps
    .map(
      (s) => `
      <li class="${s.done ? 'done' : ''}">
        <span class="check" aria-hidden="true">${s.done ? '✓' : ''}</span>
        <span class="step-txt"><strong>${esc(s.label)}</strong><span class="muted"> — ${esc(s.hint)}</span></span>
      </li>`
    )
    .join('')
  return `
    <div class="card getting-started" id="getting-started">
      <div class="gs-head">
        <h2>Get started</h2>
        <button type="button" class="ghost btn-sm" data-hide-gs hidden>Hide</button>
      </div>
      <ol class="checklist">${items}</ol>
    </div>`
}

/** A small footer of help destinations, shown on every dashboard state. */
function helpFooter(links: HelpLinks): string {
  return `
    <footer class="help-footer">
      <a href="${esc(links.connect)}" target="_blank" rel="noopener">Connect guide</a>
      <a href="${esc(links.faq)}" target="_blank" rel="noopener">FAQ</a>
      <a href="${esc(links.status)}" target="_blank" rel="noopener">Status</a>
      <a href="${esc(links.selfhost)}" target="_blank" rel="noopener">Self-host</a>
      <a href="${esc(links.cloud)}" target="_blank" rel="noopener">About Cloud</a>
    </footer>`
}

/**
 * Vanilla-JS hydration for the guided-connect bits: tab switching, copy buttons,
 * and the getting-started "Hide". Always included (unlike `liveScript()`, which
 * early-returns when there are no live tiles) because these elements appear exactly
 * on the unconnected/cold dashboard where the live tiles are absent. No-op if none
 * of the elements are present.
 */
function dashScript(): string {
  return `<script>
(function(){
  // Tabs — reveal the (no-JS-hidden) tab bar and show only the active panel.
  document.querySelectorAll('[data-tabs]').forEach(function(bar){
    var host = bar.parentNode, panels = {};
    host.querySelectorAll('[data-panel]').forEach(function(p){ panels[p.getAttribute('data-panel')] = p; });
    var tabs = [].slice.call(bar.querySelectorAll('[data-tab]'));
    function activate(name, focus){
      tabs.forEach(function(t){
        var on = t.getAttribute('data-tab') === name;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1'); // roving tabindex: one Tab stop
        t.classList.toggle('active', on);
        if (on && focus) t.focus();
      });
      Object.keys(panels).forEach(function(k){ panels[k].hidden = (k !== name); });
    }
    bar.hidden = false;
    bar.addEventListener('click', function(e){
      var t = e.target.closest('[data-tab]'); if (t) activate(t.getAttribute('data-tab'));
    });
    bar.addEventListener('keydown', function(e){
      var i = tabs.indexOf(document.activeElement); if (i < 0) return;
      var n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      activate(tabs[n].getAttribute('data-tab'), true);
    });
    var first = bar.querySelector('[data-tab]'); if (first) activate(first.getAttribute('data-tab'));
  });
  // Copy buttons — clipboard API first, execCommand fallback (locked-down webviews),
  // and a text-selection last resort so the value is always at least grab-able.
  function legacyCopy(text){
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
    } catch (e) { return false; }
  }
  function selectText(node){
    try { var r = document.createRange(); r.selectNodeContents(node);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var el = document.getElementById(b.getAttribute('data-copy')); if (!el) return;
    var text = el.textContent.trim();
    var done = function(){ if (!b.getAttribute('data-label')) b.setAttribute('data-label', b.textContent);
      b.textContent = 'Copied \\u2713'; setTimeout(function(){ b.textContent = b.getAttribute('data-label'); }, 1200); };
    var fallback = function(){ if (legacyCopy(text)) done(); else selectText(el); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
  });
  // Hide the getting-started checklist (cookie remembers across reloads).
  var hideBtn = document.querySelector('[data-hide-gs]');
  if (hideBtn) {
    hideBtn.hidden = false;
    hideBtn.addEventListener('click', function(){
      document.cookie = 'xnet_gs_hidden=1; path=/; max-age=31536000; samesite=lax';
      var gs = document.getElementById('getting-started'); if (gs) gs.remove();
    });
  }
})();
</script>`
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
        <strong>Recover account</strong> restores your subscription and hub if you lost
        the passkey for your workspace (it can't restore the encrypted data itself).
        <strong>Cancel subscription</strong> stops billing and suspends your hub; your
        encrypted backup is retained so you can re-subscribe or export.
        <strong>Delete my data</strong> destroys the hub and its backup — this is
        irreversible, and not even we can recover it (we only ever hold encrypted bytes).
      </p>
      <div class="danger-actions">
        <a class="btn ghost" href="/account/recover">Recover account</a>
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
  /* Author display rules (.tabs, button) otherwise beat the UA [hidden] rule, so the
     no-JS tab bar / Hide button would show before dashScript() arms them. */
  [hidden] { display: none !important; }
  body { margin: 0; background: #0a0a0f; color: #e5e7eb; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 24px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
  header .brand { font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
  header .header-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: flex-end; }
  header .who { color: #9ca3af; font-size: 13px; }
  .header-btn { padding: 7px 14px; font-size: 13px; }
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
  .diag-issues { margin: 0; padding-left: 18px; color: #d1d5db; font-size: 13px; }
  .diag-issues li { margin: 2px 0; }
  .diag-issues code { color: #a5b4fc; }
  .spark { margin-bottom: 16px; }
  .spark svg { width: 100%; height: 40px; display: block; background: #0d0d12; border: 1px solid #1f1f27; border-radius: 10px; }
  .spark-lbl { display: block; font-size: 12px; margin-top: 6px; }
  .budget { margin-bottom: 16px; }
  .budget-bar { height: 8px; background: #1c1c24; border-radius: 999px; overflow: hidden; margin-bottom: 6px; }
  .budget-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
  .overquota-note { color: #fca5a5; font-size: 13px; font-weight: 500; margin: 0 0 8px; padding: 8px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 9px; }
  h3 { font-size: 14px; margin: 0; }
  .btn-sm { padding: 5px 11px; font-size: 13px; }
  .copy { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; vertical-align: middle; }
  .tabs { display: flex; gap: 6px; margin: 14px 0 16px; flex-wrap: wrap; }
  .tab { background: #0d0d12; border: 1px solid #23232b; color: #9ca3af; border-radius: 9px; padding: 7px 13px; font-size: 13px; font-weight: 500; cursor: pointer; }
  .tab:hover { color: #e5e7eb; }
  .tab.active { background: #1c1c24; color: #fff; border-color: #3a3a44; }
  .tabpanel { padding-top: 4px; }
  .tabpanel + .tabpanel { margin-top: 16px; }
  .panel-h { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
  .note { font-size: 13px; margin: 8px 0 0; }
  .help-row { margin: 16px 0 0; font-size: 13px; }
  .help-row a, .help-footer a { color: #818cf8; text-decoration: none; }
  .help-row a:hover, .help-footer a:hover { text-decoration: underline; }
  .getting-started { border-color: #2e2e63; background: linear-gradient(180deg, #15152e, #121218); }
  .gs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .gs-head h2 { margin: 0; }
  .checklist { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 10px; }
  .checklist li { display: flex; align-items: flex-start; gap: 10px; }
  .checklist .check { flex: 0 0 20px; height: 20px; width: 20px; border-radius: 999px; border: 1px solid #3a3a44; color: #34d399; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
  .checklist li.done .check { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.4); }
  .checklist li.done .step-txt strong { color: #9ca3af; }
  .help-footer { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #1f1f27; font-size: 13px; }
`

/**
 * Wrap inner HTML in the shared dark-themed document chrome. When `appUrl` is
 * given, the header carries a persistent "Open web app" button so the workspace
 * is one click away from anywhere in the control plane — independent of whether a
 * hub is connected yet (the connect card's own link only shows once connected).
 */
function page(title: string, who: string, inner: string, appUrl?: string): string {
  const openApp = appUrl
    ? `<a class="btn header-btn" href="${esc(appUrl)}" target="_blank" rel="noopener">Open web app ↗</a>`
    : ''
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head><body><div class="wrap">
  <header>
    <span class="brand">xNet Cloud</span>
    <span class="header-right">
      ${openApp}
      <span class="who">${esc(who)} · <a href="/logout" style="color:#9ca3af">Sign out</a></span>
    </span>
  </header>
  ${inner}
</div></body></html>`
}

/** The tenant's hub endpoint as the WebSocket URL the web client dials. */
function toWssHub(hubUrl: string): string {
  if (hubUrl.startsWith('https://')) return `wss://${hubUrl.slice('https://'.length)}`
  if (hubUrl.startsWith('http://')) return `ws://${hubUrl.slice('http://'.length)}`
  return hubUrl
}

/**
 * The "Open web app" target, carrying the tenant's personal hub as `?hub=` so the
 * web app dials *their* hub instead of the shared default. The web app reads,
 * normalizes, and persists this param on boot. Falls back to the bare app URL when
 * no hub is reachable (suspended/sleeping → empty `hubUrl`) or the app URL is
 * malformed.
 */
function appUrlWithHub(appUrl: string, tenant: TenantRecord | null): string {
  if (!tenant?.hubUrl) return appUrl
  try {
    const u = new URL(appUrl)
    u.searchParams.set('hub', toWssHub(tenant.hubUrl))
    return u.toString()
  } catch {
    return appUrl
  }
}

/** Render the full dashboard HTML document. */
export function renderDashboard(view: DashboardView): string {
  const who = view.email ?? view.billingUserId
  const appUrl = view.appUrl ?? 'https://xnet.fyi/app'
  // The hub-pinned app URL used by every "Open the (web) app" link on the page.
  const webAppUrl = appUrlWithHub(appUrl, view.tenant)
  const links = helpLinks(view.marketingUrl ?? 'https://xnet.fyi/cloud')
  const body = view.tenant
    ? `${gettingStarted(view)}${hubCard(view.tenant)}${aiUsageCard(view, view.tenant)}${connectCard(view.tenant, webAppUrl, links)}${planChangeCard(view, view.tenant)}${billingCard(view, view.tenant)}${dangerZone()}${liveScript()}`
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
     ${body}
     ${helpFooter(links)}
     ${dashScript()}`,
    webAppUrl
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

/**
 * Shown when a downgrade would shrink the storage quota below the data already
 * stored (or when current usage couldn't be measured). Nothing has changed; the
 * user picks a path: free up space and retry, or wipe & start fresh at the smaller
 * plan. We never silently shrink the quota or delete data (exploration 0216).
 */
export function renderOverQuotaNotice(opts: {
  who: string
  from: PlanId
  to: PlanId
  usedBytes: number | null
  targetQuotaBytes: number
  reclaimBytes: number | null
  appUrl?: string
}): string {
  const target = fmtBytes(opts.targetQuotaBytes)
  const measured = opts.usedBytes !== null
  const headline = measured
    ? `Your data doesn't fit on the ${esc(opts.to)} plan yet`
    : `We couldn't confirm your current usage`
  const detail = measured
    ? `<p class="muted">You're storing <strong>${fmtBytes(opts.usedBytes as number)}</strong>, but
       the <strong>${esc(opts.to)}</strong> plan includes <strong>${target}</strong>. Free up at
       least <strong>${fmtBytes(opts.reclaimBytes as number)}</strong> and try again, or wipe and
       start fresh below. Nothing has changed — you're still on <strong>${esc(opts.from)}</strong>.</p>`
    : `<p class="muted">Your hub appears to be asleep, so we can't safely confirm your data fits in
       the <strong>${esc(opts.to)}</strong> plan's <strong>${target}</strong>. Open the app to wake
       it, then try the switch again — or wipe and start fresh below. Nothing has changed yet.</p>`
  const openApp = opts.appUrl
    ? `<a class="btn btn-sm" href="${esc(opts.appUrl)}" target="_blank" rel="noopener">Open the app to free space ↗</a>`
    : ''
  return page(
    'xNet Cloud — Plan change',
    opts.who,
    `<h1>Plan change</h1>
     <div class="card">
       <h2>${headline}</h2>
       ${detail}
       <p class="muted"><strong>Free up space (recommended).</strong> Delete data you no longer need,
       empty the trash, then come back and switch — your data and history stay intact.</p>
       ${openApp}
       <a class="btn ghost" href="/dashboard">Back to dashboard</a>
     </div>
     <div class="card danger">
       <h2>Or wipe &amp; start fresh</h2>
       <p class="muted">Permanently erase this hub's data and start over on the
       <strong>${esc(opts.to)}</strong> plan. This destroys all your data and cannot be undone — not
       even we can recover it.</p>
       <form method="post" action="/account/plan/wipe"
             onsubmit="return confirm('Permanently erase ALL data on your hub and start fresh on the ${esc(opts.to)} plan? This cannot be undone.')">
         <input type="hidden" name="plan" value="${esc(opts.to)}" />
         <input type="hidden" name="confirm" value="wipe" />
         <button type="submit" class="destructive">Wipe data &amp; switch to ${esc(opts.to)}</button>
       </form>
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

/**
 * Confirmation page for billing-only account recovery (exploration 0243). It is blunt
 * about the split: recovery restores the paid account and hub, but NOT the encrypted
 * data, which was sealed to the passkey DID the user is replacing.
 */
export function renderRecoverConfirm(opts: { who: string }): string {
  return page(
    'xNet Cloud — Recover account',
    opts.who,
    `<h1>Recover your account</h1>
     <p class="lead">Use this if you lost the passkey for your workspace.</p>
     <div class="card">
       <h2>What recovery does <span class="badge">Billing identity</span></h2>
       <p class="muted">Your subscription and hub stay exactly as they are. We clear the
         lost passkey identity so you can connect a fresh device to this hub.</p>
       <p style="color:#fbbf24">It does <strong>not</strong> restore your existing
         encrypted data — that was sealed to the passkey you lost. If you saved a recovery
         phrase, import it on the new device instead to keep your data.</p>
       <form method="post" action="/account/recover">
         <button type="submit">Recover my account</button>
       </form>
       <a class="btn" href="/dashboard" style="margin-top:10px;display:inline-block">Cancel</a>
     </div>`
  )
}

/** Render the result after a recovery attempt. */
export function renderRecoverResult(opts: { who: string; ok: boolean }): string {
  const inner = opts.ok
    ? `<div class="card">
         <h2>Account recovered <span class="badge badge-ok">Done</span></h2>
         <p class="muted">Open xNet on a new device and connect it — it will create a fresh
           passkey and claim this hub. Your subscription is unchanged.</p>
         <a class="btn" href="/claim">Connect a device</a>
       </div>`
    : `<div class="card">
         <h2>Nothing to recover</h2>
         <p class="muted">We couldn't find a hub bound to this account. If you just signed
           up, finish checkout first.</p>
         <a class="btn" href="/dashboard">Back to dashboard</a>
       </div>`
  return page('xNet Cloud — Recover account', opts.who, `<h1>Recover your account</h1>${inner}`)
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
