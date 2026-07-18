import { a as createComponent, f as renderComponent, e as renderScript, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { $ as $$CodeBlock } from '../chunks/CodeBlock_8tlStNyV.mjs';
/* empty css                                   */
export { renderers } from '../renderers.mjs';

const $$Devtool = createComponent(($$result, $$props, $$slots) => {
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const str = (s) => `<span class="tok-string">${s}</span>`;
  const enableCode = [
    `${kw("import")} { XNetDevToolsProvider } ${kw("from")} ${str("'@xnetjs/devtools'")}`,
    ``,
    `<${fn("XNetDevToolsProvider")}>`,
    `  <${fn("App")} />`,
    `</${fn("XNetDevToolsProvider")}>`,
    ``,
    `${'<span class="tok-comment">// Press \u2318\u21E7D (Ctrl+Shift+D) to open. Tree-shakes to zero in production.</span>'}`
  ].join("\n");
  const panels = [
    {
      id: "data",
      label: "Data",
      blurb: "Query and browse every node in the store on the same grid your app ships with.",
      bullets: ["Live query-plan inspector", "Inline editing with per-cell permissions", "Sort, filter, hide columns per schema"]
    },
    {
      id: "changes",
      label: "Changes",
      blurb: "A live, Lamport-ordered feed of the CRDT change log \u2014 every create, update, and delete.",
      bullets: ["Filter by change type or node", "Inspect the full change payload", "Follow remote changes as they sync"]
    },
    {
      id: "performance",
      label: "Performance",
      blurb: "Cold-start boot timeline, live FPS and heap, storage status, and active query counts.",
      bullets: ["Boot waterfall by phase", "Frame budget + heap sampling", "Active useQuery / useMutate subscriptions"]
    },
    {
      id: "logs",
      label: "Logs",
      blurb: "Toggle debug channels (sync, sqlite, query, boot) and search the captured console buffer.",
      bullets: ["Per-channel on/off, persisted", "Level filter + full-text search", "Pause, clear, copy"]
    },
    {
      id: "seed",
      label: "Seed",
      blurb: "Populate a realistic demo workspace across every content type \u2014 idempotent and scalable.",
      bullets: ["Converge / accrete / reseed modes", "Small \u2192 large volume knob", "Per-domain toggles (CRM, docs, \u2026)"]
    }
  ];
  const moreGroups = [
    { group: "Hero", items: ["Data", "Changes", "Logs", "Performance"] },
    { group: "Data", items: ["Schemas", "Schema History"] },
    { group: "Activity", items: ["Sync", "Queries", "Traces", "Telemetry"] },
    { group: "Protocol", items: ["Yjs", "AuthZ", "Abuse", "Security", "Version", "Migrate"] },
    { group: "Tools", items: ["Seed", "History", "SQLite", "Reset"] }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet DevTools \u2014 see your whole local-first app", "description": "A 20-panel in-browser debug suite for xNet apps: browse the database, watch the CRDT change log, inspect query plans, profile boot, and seed demo data. Built on the same React hooks; zero bytes in production.", "class": "astro-6m3lsk6y" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, { "class": "astro-6m3lsk6y" })} ${maybeRenderHead()}<main class="astro-6m3lsk6y"> <!-- Hero --> <section class="border-b border-border/50 py-20 lg:py-28 astro-6m3lsk6y"> <div class="mx-auto max-w-4xl px-6 text-center astro-6m3lsk6y"> <h1 class="text-4xl font-bold tracking-tight sm:text-5xl astro-6m3lsk6y"> <span class="bg-gradient-to-br from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent astro-6m3lsk6y">
DevTools
</span> </h1> <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400 astro-6m3lsk6y">
See your whole database, watch every change, inspect query plans, and profile boot —
          in the browser. Built on the same hooks your app uses, and it tree-shakes to
<strong class="text-gray-700 dark:text-gray-200 astro-6m3lsk6y">zero bytes</strong> in production.
</p> <div class="mt-6 flex flex-wrap justify-center gap-3 text-xs text-gray-500 dark:text-gray-400 astro-6m3lsk6y"> <span class="rounded-full border border-border bg-surface/30 px-3 py-1 astro-6m3lsk6y">⌘⇧D to toggle</span> <span class="rounded-full border border-border bg-surface/30 px-3 py-1 astro-6m3lsk6y">⌘⇧P command palette</span> <span class="rounded-full border border-border bg-surface/30 px-3 py-1 astro-6m3lsk6y">20 panels</span> </div> </div> </section> <!-- Panel switcher --> <section class="py-20 lg:py-28 astro-6m3lsk6y"> <div class="mx-auto max-w-5xl px-6 astro-6m3lsk6y"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Every panel, one keystroke away", "align": "center", "class": "astro-6m3lsk6y" })} <!-- Tab bar --> <div id="dt-tabs" class="mt-10 flex flex-wrap justify-center gap-2 astro-6m3lsk6y" role="tablist"> ${panels.map((p, i) => renderTemplate`<button type="button" role="tab"${addAttribute(i, "data-dttab")}${addAttribute(i === 0 ? "true" : "false", "aria-selected")} class="dt-tab rounded-lg border border-border px-4 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:hover:text-gray-200 aria-selected:border-indigo-500/50 aria-selected:bg-indigo-500/10 aria-selected:text-indigo-600 dark:aria-selected:text-indigo-300 astro-6m3lsk6y"> ${p.label} </button>`)} </div> <!-- Panels --> <div class="mt-8 astro-6m3lsk6y"> ${panels.map((p, i) => renderTemplate`<div class="dt-panel grid items-center gap-8 lg:grid-cols-2 astro-6m3lsk6y"${addAttribute(i, "data-dtpanel")}${addAttribute(i !== 0, "hidden")}> <!-- Real screenshot of the actual DevTools panel (dark mode) --> <img${addAttribute(`/images/devtools-${p.id}.png`, "src")}${addAttribute(`xNet DevTools \u2014 ${p.label} panel`, "alt")} loading="lazy" decoding="async" width="1360" height="680" class="w-full rounded-xl border border-border shadow-xl astro-6m3lsk6y"> <!-- Copy --> <div class="astro-6m3lsk6y"> <h3 class="text-xl font-semibold astro-6m3lsk6y">${p.label}</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400 astro-6m3lsk6y">${p.blurb}</p> <ul class="mt-4 space-y-2 astro-6m3lsk6y"> ${p.bullets.map((b) => renderTemplate`<li class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 astro-6m3lsk6y"> <svg class="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 astro-6m3lsk6y" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" class="astro-6m3lsk6y"></path></svg> ${b} </li>`)} </ul> </div> </div>`)} </div> </div> </section> <!-- Built on the same hooks --> <section class="border-y border-border/50 py-16 astro-6m3lsk6y"> <div class="mx-auto max-w-3xl px-6 text-center astro-6m3lsk6y"> <p class="text-lg text-gray-600 dark:text-gray-300 astro-6m3lsk6y">
The Data panel is the same <code class="font-mono text-sm astro-6m3lsk6y">GridSurface</code> +
<code class="font-mono text-sm astro-6m3lsk6y">useQuery</code> your app ships with — so what you debug
          is exactly what you build.
</p> </div> </section> <!-- Enable --> <section class="py-20 lg:py-28 astro-6m3lsk6y"> <div class="mx-auto max-w-2xl px-6 astro-6m3lsk6y"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Turn it on", "subtitle": "One provider. Dev-only by default.", "align": "center", "class": "astro-6m3lsk6y" })} <div class="mt-8 astro-6m3lsk6y"> ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "main.tsx", "code": enableCode, "class": "astro-6m3lsk6y" })} </div> </div> </section> <!-- All panels --> <section class="border-t border-border/50 py-20 lg:py-28 astro-6m3lsk6y"> <div class="mx-auto max-w-5xl px-6 astro-6m3lsk6y"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Twenty panels", "subtitle": "Hero panels stay visible; the rest are a fuzzy \u2318\u21E7P palette away.", "align": "center", "class": "astro-6m3lsk6y" })} <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5 astro-6m3lsk6y"> ${moreGroups.map((g) => renderTemplate`<div class="rounded-xl border border-border bg-surface/30 p-5 dark:bg-surface/50 astro-6m3lsk6y"> <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 astro-6m3lsk6y">${g.group}</h3> <ul class="mt-3 space-y-1.5 astro-6m3lsk6y"> ${g.items.map((i) => renderTemplate`<li class="text-sm text-gray-600 dark:text-gray-300 astro-6m3lsk6y">${i}</li>`)} </ul> </div>`)} </div> </div> </section> <!-- CTA --> <section class="border-t border-border/50 py-20 lg:py-28 astro-6m3lsk6y"> <div class="mx-auto max-w-3xl px-6 text-center astro-6m3lsk6y"> <h2 class="text-2xl font-bold tracking-tight sm:text-3xl astro-6m3lsk6y">Build with confidence</h2> <p class="mx-auto mt-3 max-w-xl text-gray-500 dark:text-gray-400 astro-6m3lsk6y">
DevTools ships with xNet React. Start with the hooks and open it with ⌘⇧D.
</p> <div class="mt-6 flex flex-wrap justify-center gap-4 astro-6m3lsk6y"> <a href="/react" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors astro-6m3lsk6y">
xNet for React →
</a> <a href="/docs/guides/devtools/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all astro-6m3lsk6y">
DevTools guide
</a> </div> </div> </section> </main> ${renderComponent($$result2, "Footer", $$Footer, { "class": "astro-6m3lsk6y" })} ` })} ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/pages/devtool.astro?astro&type=script&index=0&lang.ts")} `;
}, "/home/runner/work/xNet/xNet/site/src/pages/devtool.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/devtool.astro";
const $$url = "/devtool";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Devtool,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
