import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { $ as $$CodeBlock } from '../chunks/CodeBlock_8tlStNyV.mjs';
import { $ as $$CodeTabs } from '../chunks/CodeTabs_H66Nh4pb.mjs';
export { renderers } from '../renderers.mjs';

const $$React = createComponent(async ($$result, $$props, $$slots) => {
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const str = (s) => `<span class="tok-string">${s}</span>`;
  const num = (s) => `<span class="tok-number">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const heroCode = [
    `${cm("// Live, typed, offline-first \u2014 one hook")}`,
    `${kw("const")} { data: tasks } = ${fn("useQuery")}(TaskSchema, {`,
    `  where: { done: ${num("false")} }`,
    `})`
  ].join("\n");
  const installTabs = [
    { label: "pnpm", code: `${str("pnpm")} add @xnetjs/react` },
    { label: "npm", code: `${str("npm")} install @xnetjs/react` },
    { label: "yarn", code: `${str("yarn")} add @xnetjs/react` }
  ];
  const schemaCode = [
    `${cm("// 1. Define a typed schema (with optional authorization)")}`,
    `${kw("const")} TaskSchema = ${fn("defineSchema")}({`,
    `  name: ${str("'Task'")},`,
    `  namespace: ${str("'xnet://my-app/'")},`,
    `  properties: {`,
    `    title: ${fn("text")}({ required: ${num("true")} }),`,
    `    done: ${fn("boolean")}(),`,
    `    assignee: ${fn("person")}()`,
    `  }`,
    `})`
  ].join("\n");
  const hooksCode = [
    `${cm("// 2. Read, write, and collaborate \u2014 no API, no fetch")}`,
    `${kw("const")} { data: tasks } = ${fn("useQuery")}(TaskSchema, { where: { done: ${num("false")} } })`,
    `${kw("const")} { create, update, remove } = ${fn("useMutate")}()`,
    ``,
    `${fn("create")}(TaskSchema, { title: ${str("'Ship it'")} })`,
    `${fn("update")}(TaskSchema, id, { done: ${num("true")} })`,
    ``,
    `${cm("// Real-time collaborative documents")}`,
    `${kw("const")} { doc, peerCount } = ${fn("useNode")}(PageSchema, id) ${cm("// \u2192 TipTap / ProseMirror")}`
  ].join("\n");
  const managedCode = [
    `${cm("// Point XNetProvider at a Hub URL \u2014 sync just works")}`,
    `<${fn("XNetProvider")} config={{ hubUrl: ${str("'wss://hub.xnet.fyi'")} }}>`,
    `  <${fn("App")} />`,
    `</${fn("XNetProvider")}>`
  ].join("\n");
  const byoServerCode = [
    `${cm("// your Node backend \u2014 your auth, your database")}`,
    `${kw("const")} xnet = ${kw("await")} ${fn("createXNetServer")}({`,
    `  trust: ${str("'custodial'")},`,
    `  authenticate: (token) => ${fn("verifyMySession")}(token),    ${cm("// no DID needed")}`,
    `  authorizeRead: (ctx, q) => q.${fn("and")}({ tenant: ctx.tenant }),`,
    `  authorizeWrite: (ctx, w) =>`,
    `    ctx.tenant === (w.op === ${str("'create'")}`,
    `      ? w.payload.properties.tenant`,
    `      : w.existing?.properties.tenant)`,
    `      ? { ok: ${num("true")} }`,
    `      : { ok: ${num("false")}, reason: ${str("'wrong tenant'")} }`,
    `})`
  ].join("\n");
  const byoClientCode = [
    `${cm("// client \u2014 the same hooks, pointed at your server")}`,
    `<${fn("XNetProvider")} config={{`,
    `  remoteNodeQueryClient: xnet.${fn("createRemoteQueryClient")}(getToken)`,
    `}}>`,
    `  <${fn("App")} />`,
    `</${fn("XNetProvider")}>`
  ].join("\n");
  const features = [
    { title: "Offline-first", body: "Reads and writes hit a local store instantly; sync happens in the background." },
    { title: "Real-time sync", body: "Subscriptions update live as peers or the server change data." },
    { title: "Optimistic by default", body: "Mutations apply locally and reconcile \u2014 no manual cache wrangling." },
    { title: "TypeScript-first", body: "Full inference from your schemas through every hook." },
    { title: "Authorization built in", body: "Declare roles and actions on the schema, or enforce your own server-side." },
    { title: "AI-assistant friendly", body: "Three hooks and typed schemas \u2014 easy for any coding assistant to drive." }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet for React \u2014 local-first hooks, your backend", "description": "Build local-first React apps with useQuery, useMutate, and useNode. Use a managed Hub out of the box, or run your own server with your own auth." }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> <!-- Hero --> <section class="border-b border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-5xl px-6"> <div class="grid items-center gap-10 lg:grid-cols-2"> <div> <h1 class="text-4xl font-bold tracking-tight sm:text-5xl"> <span class="bg-gradient-to-br from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
xNet for React
</span> </h1> <p class="mt-4 text-lg text-gray-500 dark:text-gray-400">
Typed schemas, live <code class="font-mono text-sm">useQuery</code> /
<code class="font-mono text-sm">useMutate</code> /
<code class="font-mono text-sm">useNode</code>, and an offline-first cache.
              Bring a managed Hub or your own server.
</p> <div class="mt-6 max-w-sm"> ${renderComponent($$result2, "CodeTabs", $$CodeTabs, { "tabs": installTabs, "group": "pkg" })} </div> <div class="mt-6 flex flex-wrap gap-4"> <a href="#hooks" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Start with the hooks
</a> <a href="/docs/hooks/overview/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Read the docs
</a> </div> </div> <div class="min-w-0"> ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "Tasks.tsx", "code": heroCode })} </div> </div> </div> </section> <!-- The hooks --> <section id="hooks" class="py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Start with the client", "subtitle": "Define a schema, then read and write it from React. Storage, crypto, and networking are handled for you.", "align": "center" })} <div class="mt-10 space-y-6"> ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "schema.ts", "code": schemaCode })} ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "Tasks.tsx", "code": hooksCode })} </div> <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
More hooks: <code class="font-mono">useInfiniteQuery</code>,
<code class="font-mono">useComments</code>, <code class="font-mono">useHistory</code>,
<code class="font-mono">useUndo</code>. See the
<a href="/docs/hooks/overview/" class="text-indigo-600 hover:underline dark:text-indigo-400">hooks reference →</a> </p> </div> </section> <!-- How it works --> <section class="border-y border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-4xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "How it works", "align": "center" })} <div class="mt-10 grid gap-6 sm:grid-cols-3"> ${[
    { n: "1", t: "Define your data", b: "A typed schema \u2014 properties, relations, and optional authorization." },
    { n: "2", t: "Call the hook", b: "useQuery / useMutate / useNode in any component. Fully typed." },
    { n: "3", t: "It syncs", b: "Local-first cache + background sync to a Hub or your own server." }
  ].map((s) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface/30 p-6 dark:bg-surface/50"> <div class="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-semibold text-indigo-500"> ${s.n} </div> <h3 class="mt-4 text-base font-semibold">${s.t}</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">${s.b}</p> </div>`)} </div> </div> </section> <!-- The fork --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-4xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Pick your backend", "subtitle": "The hooks are identical either way. Choose the path that fits your app.", "align": "center" })} <div class="mt-10 grid gap-6 sm:grid-cols-2"> <a href="#managed" class="animate-on-scroll block rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-6 transition-colors hover:border-emerald-500/40"> <h3 class="text-lg font-semibold text-emerald-500 dark:text-emerald-400">Managed Hub</h3> <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
Set one <code class="font-mono text-xs">hubUrl</code>. Sync, presence, and
              encrypted backup just work — no server to run.
</p> <span class="mt-4 inline-block text-sm text-emerald-500 dark:text-emerald-400">Works out of the box →</span> </a> <a href="#byo" class="animate-on-scroll block rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03] p-6 transition-colors hover:border-indigo-500/40"> <h3 class="text-lg font-semibold text-indigo-500 dark:text-indigo-400">Bring your own server</h3> <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
Run <code class="font-mono text-xs">@xnetjs/server</code> in your Node backend
              with your own auth and database.
</p> <span class="mt-4 inline-block text-sm text-indigo-500 dark:text-indigo-400">Full control →</span> </a> </div> <!-- Managed path detail --> <div id="managed" class="mt-14 scroll-mt-20"> <h3 class="text-sm font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Managed Hub</h3> <p class="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
Point <code class="font-mono">XNetProvider</code> at a Hub and you're done — the
            same setup the xNet app uses.
</p> <div class="mt-5 max-w-2xl"> ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "App.tsx", "code": managedCode })} </div> <a href="/docs/guides/hub/" class="mt-4 inline-block text-sm text-emerald-600 hover:underline dark:text-emerald-400">
Hub setup guide →
</a> </div> <!-- BYO path detail --> <div id="byo" class="mt-14 scroll-mt-20"> <h3 class="text-sm font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Bring your own server</h3> <p class="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400"> <code class="font-mono">@xnetjs/server</code> maps <em>your</em> auth onto the data
            layer with three hooks. Reads route through the existing client seam — no hook
            changes.
</p> <div class="mt-5 grid gap-5 lg:grid-cols-2"> ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "server.ts", "code": byoServerCode })} ${renderComponent($$result2, "CodeBlock", $$CodeBlock, { "filename": "App.tsx", "code": byoClientCode })} </div> <a href="/docs/guides/server/" class="mt-4 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400">
Your-own-server guide →
</a> </div> </div> </section> <!-- DevTools --> <section class="border-y border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-4xl px-6 text-center"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "See everything in DevTools", "subtitle": "Browse your whole database, watch the change log, and profile boot \u2014 in the browser, built on the same hooks. Zero bytes in production.", "align": "center" })} <div class="mt-8 flex flex-wrap justify-center gap-3 text-xs text-gray-500 dark:text-gray-400"> ${["Data browser", "Change log", "Query plans", "Logs", "Performance", "Seed demo data"].map((t) => renderTemplate`<span class="rounded-full border border-border bg-surface/30 px-3 py-1">${t}</span>`)} </div> <div class="mt-8"> <a href="/devtool" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Explore DevTools →
</a> </div> </div> </section> <!-- Feature grid --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-5xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "What you get", "align": "center" })} <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"> ${features.map((f) => renderTemplate`<div class="animate-on-scroll rounded-xl border border-border bg-surface/30 p-6 dark:bg-surface/50"> <h3 class="text-base font-semibold">${f.title}</h3> <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">${f.body}</p> </div>`)} </div> </div> </section> <!-- Final CTA --> <section class="border-t border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6 text-center"> <h2 class="text-2xl font-bold tracking-tight sm:text-3xl">Start building</h2> <div class="mt-6 max-w-sm mx-auto"> ${renderComponent($$result2, "CodeTabs", $$CodeTabs, { "tabs": installTabs, "group": "pkg" })} </div> <div class="mt-6 flex flex-wrap justify-center gap-4"> <a href="/docs/quickstart/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Quickstart
</a> <a href="/docs/hooks/overview/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Hooks reference
</a> </div> <p class="mt-6 text-sm text-gray-500 dark:text-gray-400">
Not using React? xNet also works with
<a href="/build-with" class="text-indigo-600 hover:underline dark:text-indigo-400">Vue, Svelte, Swift, Rust, and more →</a> </p> </div> </section> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/react.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/react.astro";
const $$url = "/react";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$React,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
