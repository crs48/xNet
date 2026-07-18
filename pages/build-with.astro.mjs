import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { $ as $$CodeTabs } from '../chunks/CodeTabs_H66Nh4pb.mjs';
export { renderers } from '../renderers.mjs';

const $$BuildWith = createComponent(async ($$result, $$props, $$slots) => {
  const kw = (s) => `<span class="tok-keyword">${s}</span>`;
  const fn = (s) => `<span class="tok-function">${s}</span>`;
  const str = (s) => `<span class="tok-string">${s}</span>`;
  const cm = (s) => `<span class="tok-comment">${s}</span>`;
  const codeTabs = [
    {
      label: "TypeScript",
      code: [
        `${cm("// The reference runtime \u2014 works in any JS framework")}`,
        `${kw("const")} client = ${kw("await")} ${fn("createXNetClient")}({ authorDID, signingKey })`,
        `${kw("await")} client.mutate.${fn("create")}(TaskSchema, { title: ${str("'Ship it'")} })`,
        `${kw("const")} todo = client.${fn("query")}(TaskSchema, { where: { status: ${str("'todo'")} } })`
      ].join("\n")
    },
    {
      label: "Swift",
      code: [
        `${cm("// XNetKit \u2014 native, binds into a SwiftUI re-render loop")}`,
        `${kw("let")} store = ${fn("NodeStore")}(identity: me, persistence: ${fn("SQLiteChangeLog")}(path: dbPath))`,
        `store.${fn("create")}(Task, [${str('"title"')}: ${str('"Ship it"')}, ${str('"status"')}: ${str('"todo"')}])`,
        `${kw("let")} todo = store.${fn("query")}(${fn("Query")}(Task, where: .${fn("equals")}(${str('"status"')}, ${str('"todo"')})))`
      ].join("\n")
    },
    {
      label: "Rust",
      code: [
        `${cm("# xnet-core \u2014 the portable kernel, proven by the shared vectors")}`,
        `${kw("cd")} rust/xnet-core && ${fn("cargo test")}`,
        `${cm("# l0_identity ok \xB7 l1_change ok \xB7 l1_lww ok \xB7 l2_replication ok \xB7 l3_authz ok")}`
      ].join("\n")
    }
  ];
  const toneClass = {
    tip: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    beta: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    demand: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    muted: "border-border bg-surface/40 text-gray-500 dark:text-gray-400"
  };
  const languages = [
    { name: "TypeScript", badge: "Reference", tone: "tip", desc: "The full runtime + React SDK, published to npm. The source of truth the vectors are generated from.", href: "/docs/quickstart/" },
    { name: "React", badge: "Stable SDK", tone: "success", desc: "Hooks and components \u2014 the first-class toolkit the xNet app itself is built on.", href: "/react" },
    { name: "Swift", badge: "Native SDK \xB7 beta", tone: "beta", desc: "XNetKit: schemas, store, query, SwiftUI live binding, SQLite \u2014 plus live cross-language hub sync.", href: "/docs/languages/swift/" },
    { name: "Rust", badge: "Core \xB7 beta", tone: "beta", desc: "xnet-core: the portable interop kernel with a C/UniFFI binding surface that backs native SDKs.", href: "/docs/languages/rust/" },
    { name: "Vue \xB7 Svelte \xB7 Solid", badge: "Adapter \xB7 on demand", tone: "demand", desc: "Thin data bindings over the same runtime \u2014 useQuery / useMutate, no components. Published on request.", href: "/docs/guides/frameworks/" },
    { name: "Python \xB7 any language", badge: "Reference kernel", tone: "muted", desc: "A ~100-line verifier proves the spec, not the TypeScript source, is enough to interoperate.", href: "/docs/protocol/implement-in-your-language/" }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Build xNet apps in any language", "description": "React, Swift, Rust, Vue, Svelte, or any language \u2014 one protocol, verified by the same golden vectors. An honest map of what xNet supports and how mature each piece is." }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main> <!-- Hero --> <section class="border-b border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-5xl px-6 text-center"> <h1 class="text-4xl font-bold tracking-tight sm:text-5xl"> <span class="bg-gradient-to-br from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
One protocol. Your language.
</span> </h1> <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
xNet is a written protocol, not just an app. Build with React today, Swift or Rust
          natively, Vue or Svelte over the runtime — and every implementation passes the
<strong class="text-gray-700 dark:text-gray-200">same golden vectors</strong>. You don't
          have to trust us — you can check.
</p> <div class="mt-8 flex flex-wrap justify-center gap-4"> <a href="#matrix" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
See what's supported
</a> <a href="/docs/languages/overview/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Read the docs
</a> </div> </div> </section> <!-- One task, three languages --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "The same data, written your way", "subtitle": "Create and query a task in TypeScript or Swift; prove the Rust kernel against the shared vectors. The wire format is identical.", "align": "center" })} <div class="mt-10"> ${renderComponent($$result2, "CodeTabs", $$CodeTabs, { "tabs": codeTabs, "group": "lang" })} </div> </div> </section> <!-- Maturity matrix --> <section id="matrix" class="scroll-mt-20 border-y border-border/50 py-20 lg:py-28"> <div class="mx-auto max-w-5xl px-6"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "What's supported, honestly", "subtitle": "Maturity varies \u2014 so we label it. Nothing here is a logo wall; each row links to real, in-repo code.", "align": "center" })} <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"> ${languages.map((l) => renderTemplate`<a${addAttribute(l.href, "href")} class="animate-on-scroll block rounded-xl border border-border bg-surface/30 p-6 transition-all hover:border-indigo-500/50 dark:bg-surface/50"> <div class="flex items-center justify-between gap-3"> <h3 class="text-base font-semibold">${l.name}</h3> <span${addAttribute(`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneClass[l.tone]}`, "class")}> ${l.badge} </span> </div> <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">${l.desc}</p> </a>`)} </div> <p class="mx-auto mt-8 max-w-2xl text-center text-sm text-gray-500 dark:text-gray-400">
Only <strong class="text-gray-700 dark:text-gray-200">React</strong> ships UI components —
          the component kit is React by design. Other frameworks and languages consume the
<a href="/docs/architecture/package-graph/" class="text-indigo-600 hover:underline dark:text-indigo-400"> headless runtime</a>
or the protocol directly.
</p> </div> </section> <!-- Verifiability --> <section class="py-20 lg:py-28"> <div class="mx-auto max-w-3xl px-6 text-center"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Verifiable, not just compatible", "align": "center" })} <p class="mt-4 text-gray-500 dark:text-gray-400">
The MIT-licensed SDK and protocol ship a <strong class="text-gray-700 dark:text-gray-200">written
          spec</strong> and a language-agnostic <strong class="text-gray-700 dark:text-gray-200">golden-vector
          corpus</strong>. The TypeScript reference, the Python verifier, the Rust kernel, and the
          Swift SDK all reproduce the same DIDs and verify the same signed changes — byte-for-byte.
</p> <div class="mt-8 flex flex-wrap justify-center gap-4"> <a href="/docs/protocol/conformance/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
Conformance vectors →
</a> <a href="/docs/protocol/implement-in-your-language/" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-indigo-500/50 hover:bg-surface transition-all">
Implement it in your language →
</a> </div> </div> </section> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/build-with.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/build-with.astro";
const $$url = "/build-with";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$BuildWith,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
