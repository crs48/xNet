import { a as createComponent, m as maybeRenderHead, d as renderTemplate, f as renderComponent, F as Fragment, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const updated$1 = "2026-06-17";
const cohortFloor = 5;
const weeks$1 = [{"week":"2026-04-06","customers":6,"newCustomers":6,"churnedCustomers":0,"mrrUsd":70,"costs":{"infraUsd":4,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-04-13","customers":11,"newCustomers":5,"churnedCustomers":0,"mrrUsd":130,"costs":{"infraUsd":6,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-04-20","customers":18,"newCustomers":8,"churnedCustomers":1,"mrrUsd":220,"costs":{"infraUsd":9,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-04-27","customers":27,"newCustomers":10,"churnedCustomers":1,"mrrUsd":340,"costs":{"infraUsd":13,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-05-04","customers":39,"newCustomers":13,"churnedCustomers":1,"mrrUsd":500,"costs":{"infraUsd":18,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-05-11","customers":54,"newCustomers":17,"churnedCustomers":2,"mrrUsd":700,"costs":{"infraUsd":24,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-05-18","customers":72,"newCustomers":20,"churnedCustomers":2,"mrrUsd":950,"costs":{"infraUsd":31,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-05-25","customers":95,"newCustomers":25,"churnedCustomers":2,"mrrUsd":1280,"costs":{"infraUsd":40,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-06-01","customers":121,"newCustomers":28,"churnedCustomers":2,"mrrUsd":1640,"costs":{"infraUsd":51,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}},{"week":"2026-06-08","customers":152,"newCustomers":34,"churnedCustomers":3,"mrrUsd":2080,"costs":{"infraUsd":63,"payrollUsd":1197,"saasUsd":28,"otherUsd":46}}];
const usage$1 = {"hubsHosted":168,"hubsHot":121,"documentsSynced":48230,"aiTokensTotal":4216000,"aiRequestsTotal":9840,"storageGb":37.4,"peopleOnPlatform":412};
const raw = {
  updated: updated$1,
  cohortFloor,
  weeks: weeks$1,
  usage: usage$1,
};

const metrics = raw;
const weeks = metrics.weeks;
const latest = weeks[weeks.length - 1];
const first = weeks[0];
const usage = metrics.usage;
const weekCost = (w) => w.costs.infraUsd + w.costs.payrollUsd + w.costs.saasUsd + w.costs.otherUsd;
const weekRevenue = (w) => w.mrrUsd / 4.345;
function wow(select) {
  if (weeks.length < 2) return 0;
  const prev = select(weeks[weeks.length - 2]);
  const now = select(latest);
  if (prev === 0) return now > 0 ? 100 : 0;
  return Math.round((now - prev) / prev * 1e3) / 10;
}
const customerWoW = wow((w) => w.customers);
const mrrWoW = wow((w) => w.mrrUsd);
const cumulativeNet = (() => {
  let acc = 0;
  return weeks.map((w) => {
    acc += weekRevenue(w) - weekCost(w);
    return { week: w.week, net: Math.round(acc) };
  });
})();
const latestCostBreakdown = [
  { label: "Payroll", usd: latest.costs.payrollUsd, color: "#6366f1" },
  { label: "Infrastructure", usd: latest.costs.infraUsd, color: "#10b981" },
  { label: "Software", usd: latest.costs.saasUsd, color: "#f59e0b" },
  { label: "Overhead", usd: latest.costs.otherUsd, color: "#9ca3af" }
];
const updated = metrics.updated;

const $$OpenMetrics = createComponent(($$result, $$props, $$slots) => {
  const W = 680;
  const H = 200;
  function series(values) {
    const max = Math.max(...values, 1);
    const stepX = values.length > 1 ? W / (values.length - 1) : W;
    const pts = values.map((v, i) => [i * stepX, H - v / max * (H - 12) - 6]);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { line, area, max, last: pts[pts.length - 1] };
  }
  const customers = series(weeks.map((w) => w.customers));
  const mrr = series(weeks.map((w) => w.mrrUsd));
  const costMax = Math.max(...weeks.map(weekCost), 1);
  const barW = W / weeks.length;
  const stackOrder = [
    { key: "payrollUsd", color: "#6366f1" },
    { key: "infraUsd", color: "#10b981" },
    { key: "saasUsd", color: "#f59e0b" },
    { key: "otherUsd", color: "#9ca3af" }
  ];
  const costBars = weeks.map((w, i) => {
    let y = H;
    const segs = stackOrder.map((s) => {
      const v = w.costs[s.key];
      const h = v / costMax * (H - 8);
      y -= h;
      return { x: i * barW + 3, y, w: barW - 6, h, color: s.color };
    });
    return segs;
  });
  const monthlyRevRunRate = Math.round(latest.mrrUsd);
  const monthlyCostRunRate = Math.round(weekCost(latest) * 4.345);
  const finalNet = cumulativeNet[cumulativeNet.length - 1].net;
  const breakEvenCustomers = Math.ceil(monthlyCostRunRate / (latest.mrrUsd / latest.customers) || 0);
  const fmtUsd = (n) => `$${n.toLocaleString("en-US")}`;
  const sign = (n) => n >= 0 ? `+${n}` : `${n}`;
  const compact = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const fmtGb = (gb) => gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${compact(gb)} GB`;
  const usageCards = usage ? [
    { label: "Workspaces hosted", value: compact(usage.hubsHosted), sub: `${usage.hubsHot} live now` },
    { label: "Documents synced", value: compact(usage.documentsSynced), sub: "across live hubs" },
    ...[{ label: "Data under management", value: fmtGb(usage.storageGb), sub: "measured in R2" }] ,
    ...[{ label: "People on xNet", value: compact(usage.peopleOnPlatform), sub: "across all hubs" }] ,
    { label: "AI tokens metered", value: compact(usage.aiTokensTotal), sub: `${compact(usage.aiRequestsTotal)} requests` }
  ] : [];
  return renderTemplate`${maybeRenderHead()}<section class="mx-auto max-w-5xl px-6 py-12"> <div class="mb-8 flex items-baseline justify-between gap-4"> <h2 class="text-2xl font-semibold tracking-tight">The numbers, in the open</h2> <span class="text-sm text-neutral-500">Updated ${updated}</span> </div> ${renderTemplate`<p class="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
These are <strong>illustrative sample figures</strong> wired through the real pipeline — they'll be
      replaced with the live P&amp;L when xNet Cloud opens to the public.
</p>`} <!-- Headline stat cards --> <div class="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3"> <div class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <div class="text-sm text-neutral-500">Paying customers</div> <div class="mt-1 text-3xl font-semibold tabular-nums">${latest.customers}</div> <div class="mt-1 text-sm text-emerald-600 dark:text-emerald-400">${sign(customerWoW)}% week over week</div> </div> <div class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <div class="text-sm text-neutral-500">Monthly recurring revenue</div> <div class="mt-1 text-3xl font-semibold tabular-nums">${fmtUsd(monthlyRevRunRate)}</div> <div class="mt-1 text-sm text-emerald-600 dark:text-emerald-400">${sign(mrrWoW)}% week over week</div> </div> <div class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <div class="text-sm text-neutral-500">Monthly cost run-rate</div> <div class="mt-1 text-3xl font-semibold tabular-nums">${fmtUsd(monthlyCostRunRate)}</div> <div class="mt-1 text-sm text-neutral-500">incl. measured infra COGS</div> </div> </div> ${usageCards.length > 0 && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <h3 class="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
The product, at scale
</h3> <div class="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"> ${usageCards.map((c) => renderTemplate`<div class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <div class="text-sm text-neutral-500">${c.label}</div> <div class="mt-1 text-2xl font-semibold tabular-nums">${c.value}</div> <div class="mt-1 text-xs text-neutral-500">${c.sub}</div> </div>`)} </div> ` })}`} <!-- Growth charts --> <div class="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2"> <figure class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <figcaption class="mb-3 text-sm font-medium">Customer growth</figcaption> <svg${addAttribute(`0 0 ${W} ${H}`, "viewBox")} class="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Customer growth over time"> <path${addAttribute(customers.area, "d")} fill="#6366f1" fill-opacity="0.12"></path> <path${addAttribute(customers.line, "d")} fill="none" stroke="#6366f1" stroke-width="2"></path> <circle${addAttribute(customers.last[0], "cx")}${addAttribute(customers.last[1], "cy")} r="3.5" fill="#6366f1"></circle> </svg> <div class="mt-2 flex justify-between text-xs text-neutral-500"><span>${first.week}</span><span>${latest.week}</span></div> </figure> <figure class="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <figcaption class="mb-3 text-sm font-medium">Revenue growth (MRR)</figcaption> <svg${addAttribute(`0 0 ${W} ${H}`, "viewBox")} class="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="MRR growth over time"> <path${addAttribute(mrr.area, "d")} fill="#10b981" fill-opacity="0.12"></path> <path${addAttribute(mrr.line, "d")} fill="none" stroke="#10b981" stroke-width="2"></path> <circle${addAttribute(mrr.last[0], "cx")}${addAttribute(mrr.last[1], "cy")} r="3.5" fill="#10b981"></circle> </svg> <div class="mt-2 flex justify-between text-xs text-neutral-500"><span>${first.week}</span><span>${latest.week}</span></div> </figure> </div> <!-- Weekly cost stack --> <figure class="mb-10 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"> <figcaption class="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm font-medium"> <span>Where the money goes, week by week</span> <span class="flex flex-wrap gap-3 text-xs font-normal text-neutral-500"> ${latestCostBreakdown.map((c) => renderTemplate`<span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm"${addAttribute(`background:${c.color}`, "style")}></span>${c.label}</span>`)} </span> </figcaption> <svg${addAttribute(`0 0 ${W} ${H}`, "viewBox")} class="h-48 w-full" preserveAspectRatio="none" role="img" aria-label="Weekly cost breakdown"> ${costBars.map((segs) => segs.map((s) => renderTemplate`<rect${addAttribute(s.x, "x")}${addAttribute(s.y, "y")}${addAttribute(s.w, "width")}${addAttribute(s.h, "height")}${addAttribute(s.color, "fill")}></rect>`))} </svg> <div class="mt-2 flex justify-between text-xs text-neutral-500"><span>${first.week}</span><span>${latest.week}</span></div> </figure> <!-- Break-even framing --> <div class="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800"> <h3 class="text-lg font-medium">How we get to break-even</h3> <p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
Per-hub infrastructure is a thin, measured slice of cost — the bulk is people and fixed overhead, kept
      deliberately lean. Revenue is compounding while those costs stay roughly flat, so the gap narrows every week.
${` At the current cost run-rate of ${fmtUsd(monthlyCostRunRate)}/mo and ~${fmtUsd(Math.round(latest.mrrUsd / latest.customers))}/customer MRR, operational break-even is roughly ${breakEvenCustomers.toLocaleString("en-US")} paying customers.`} </p> <p class="mt-3 text-xs text-neutral-500">
Cumulative net to date: ${fmtUsd(finalNet)} · No per-customer figures are ever published; weeks below a
${" "}${metrics.cohortFloor}-customer floor are suppressed.
</p> </div> </section>`;
}, "/home/runner/work/xNet/xNet/site/src/components/sections/OpenMetrics.astro", void 0);

const $$Open = createComponent(($$result, $$props, $$slots) => {
  const editUrl = "https://github.com/crs48/xNet/blob/main/site/src/data/metrics.json";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Cloud \u2014 Run in the open", "description": "Customer growth, revenue, and our full cost breakdown \u2014 published transparently as we build toward break-even." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-20 lg:py-28"> <div class="mx-auto max-w-5xl px-6"> <div class="mb-2 text-center"> <h1 class="mb-5 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl">
Running the company in the open
</h1> <p class="mx-auto max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400">
We sell trust, so we show our work. Here's how xNet Cloud is actually doing —
          customers, revenue, and every dollar of cost — updated as we grow.
</p> </div> </div> ${renderComponent($$result2, "OpenMetrics", $$OpenMetrics, {})} <div class="mx-auto max-w-5xl px-6"> <p class="text-center text-sm text-gray-500">
Snapshot updated ${updated}. The numbers are produced by a privacy-safe rollup and committed to the
        repo — <a${addAttribute(editUrl, "href")} class="text-indigo-400 hover:underline">see the data on GitHub</a>. Aggregates
        only; no individual customer is ever identifiable. Live reliability is on the
<a href="/status" class="text-indigo-400 hover:underline">status page</a>.
</p> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/open.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/open.astro";
const $$url = "/open";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Open,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
