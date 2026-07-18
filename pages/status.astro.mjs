import { a as createComponent, f as renderComponent, e as renderScript, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
export { renderers } from '../renderers.mjs';

const overall = "operational";
const components = [{"id":"control-plane","status":"operational"},{"id":"hub-fleet","status":"operational","availability":null},{"id":"ai-gateway","status":"not-configured"},{"id":"backups","status":"not-configured"}];
const errorBudgetPolicy = {"ship":0,"caution":0,"freeze":0};
const raw = {
  overall,
  components,
  errorBudgetPolicy,
};

const fallback = raw;
const STATUS_URL = "https://cloud.xnet.fyi/status.json";
const COMPONENT_LABELS = {
  "control-plane": "Control plane",
  "hub-fleet": "Hub fleet",
  "ai-gateway": "Managed AI gateway",
  backups: "Backups (Litestream → R2)"
};
const STATUS_LABELS = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  "not-configured": "Not configured"
};
const STATUS_COLORS = {
  operational: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
  "not-configured": "#9ca3af"
};

const $$Status = createComponent(async ($$result, $$props, $$slots) => {
  const overallColor = STATUS_COLORS[fallback.overall];
  const overallLabel = "All systems operational" ;
  const fmtPct = (a) => a === null || a === void 0 ? "" : `${(a * 100).toFixed(2)}% uptime`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Cloud \u2014 Status", "description": "Live operational status for xNet Cloud \u2014 control plane, hub fleet, managed AI, and backups." }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-20 lg:py-28"${addAttribute(STATUS_URL, "data-status-url")}> <div class="mx-auto max-w-3xl px-6"> <h1 class="mb-3 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl">System status</h1> <p class="mb-8 max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-400">
Live status for xNet Cloud, published straight from the control plane's own health probes.
</p> <!-- Overall banner --> <div id="overall-banner" class="mb-8 flex items-center gap-3 rounded-xl border px-5 py-4"${addAttribute(`border-color:${overallColor}55;background:${overallColor}14`, "style")}> <span id="overall-dot" class="inline-block h-3 w-3 shrink-0 rounded-full"${addAttribute(`background:${overallColor}`, "style")}></span> <span id="overall-label" class="text-base font-semibold text-gray-800 dark:text-gray-100">${overallLabel}</span> </div> <!-- Components --> <ul id="components" class="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800"> ${fallback.components.map((c) => renderTemplate`<li${addAttribute(c.id, "data-component")} class="flex items-center justify-between gap-4 bg-white/40 px-5 py-4 dark:bg-white/[0.02]"> <span class="font-medium text-gray-700 dark:text-gray-200"> ${COMPONENT_LABELS[c.id] ?? c.id} </span> <span class="flex items-center gap-2 text-sm"> <span data-availability class="text-gray-400">${fmtPct(c.availability)}</span> <span data-dot class="inline-block h-2.5 w-2.5 rounded-full"${addAttribute(`background:${STATUS_COLORS[c.status]}`, "style")}></span> <span data-label class="text-gray-600 dark:text-gray-300"> ${STATUS_LABELS[c.status]} </span> </span> </li>`)} </ul> <!-- Error-budget policy summary --> <div id="budget" class="mt-6 text-sm text-gray-500">
Deploy posture (Google-SRE error budget):
<span id="budget-ship">${fallback.errorBudgetPolicy.ship}</span> shipping ·
<span id="budget-caution">${fallback.errorBudgetPolicy.caution}</span> cautious ·
<span id="budget-freeze">${fallback.errorBudgetPolicy.freeze}</span> frozen
</div> <p id="freshness" class="mt-8 text-sm text-gray-500">
Showing the last published snapshot — live status at
<a${addAttribute(STATUS_URL, "href")} class="text-indigo-400 hover:underline">${STATUS_URL}</a>.
</p> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })} ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/pages/status.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/status.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/status.astro";
const $$url = "/status";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Status,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
