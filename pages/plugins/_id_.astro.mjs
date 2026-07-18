import { c as createAstro, a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../../chunks/Footer_RAA8cLWV.mjs';
import { p as priceLabel, a as plugins, t as tierLabel } from '../../chunks/plugins_DBGjROUw.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
function getStaticPaths() {
  return plugins.map((plugin) => ({ params: { id: plugin.id }, props: { plugin } }));
}
const $$id = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$id;
  const { plugin } = Astro2.props;
  const isBuiltIn = plugin.tier === "bundled";
  plugin.pricing && plugin.pricing.mode !== "free";
  const installHref = plugin.manifestUrl ? `xnet://install?manifest=${encodeURIComponent(plugin.manifestUrl)}` : "/app";
  const facts = [
    { label: "Version", value: plugin.version },
    { label: "Author", value: plugin.author },
    { label: "Category", value: plugin.category },
    { label: "License", value: plugin.license ?? "MIT" },
    { label: "Platforms", value: (plugin.platforms ?? ["web", "electron"]).join(", ") },
    { label: "Price", value: priceLabel(plugin.pricing) }
  ];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${plugin.name} \u2014 xNet Plugins`, "description": plugin.description }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-12 lg:py-20"> <div class="mx-auto max-w-3xl px-6"> <a href="/plugins/" class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"> <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6"></path></svg>
All plugins
</a> <div class="mt-6 flex flex-wrap items-start justify-between gap-4"> <div> <div class="flex items-center gap-3"> <h1 class="text-3xl font-bold text-gray-900 dark:text-white">${plugin.name}</h1> <span${addAttribute(`rounded-full border px-2.5 py-0.5 text-xs font-medium ${isBuiltIn ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`, "class")}> ${tierLabel(plugin.tier)} </span> </div> <p class="mt-1 font-mono text-sm text-gray-400">${plugin.id}</p> </div> ${isBuiltIn ? renderTemplate`<a href="/app" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Open the app
</a>` : renderTemplate`<a${addAttribute(installHref, "href")} class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Open in xNet
</a>`} </div> <p class="mt-6 text-lg leading-relaxed text-gray-600 dark:text-gray-300">${plugin.description}</p> ${isBuiltIn && renderTemplate`<p class="mt-4 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
This plugin ships with xNet — it's available out of the box, no installation required.
</p>`} <!-- Facts grid --> <dl class="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3"> ${facts.map((f) => renderTemplate`<div class="bg-surface/40 p-4"> <dt class="text-xs uppercase tracking-wide text-gray-400">${f.label}</dt> <dd class="mt-1 text-sm font-medium capitalize text-gray-800 dark:text-gray-200">${f.value}</dd> </div>`)} </dl> ${plugin.contributes && plugin.contributes.length > 0 && renderTemplate`<div class="mt-8"> <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Extends</h2> <div class="mt-3 flex flex-wrap gap-2"> ${plugin.contributes.map((c) => renderTemplate`<span class="rounded-md border border-border bg-surface/40 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300">${c}</span>`)} </div> </div>`} ${plugin.keywords && plugin.keywords.length > 0 && renderTemplate`<div class="mt-8"> <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Tags</h2> <div class="mt-3 flex flex-wrap gap-2"> ${plugin.keywords.map((k) => renderTemplate`<span class="rounded bg-border/60 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">${k}</span>`)} </div> </div>`} ${!isBuiltIn && renderTemplate`<div class="mt-10 rounded-xl border border-border bg-surface/30 p-5"> <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">How install works</h2> <p class="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
Community plugins are hosted in the author's own repository. When you click
<span class="font-medium">Open in xNet</span>, the app fetches the manifest, shows you
            exactly which capabilities it requests, verifies its provenance, and runs it in a
            sandbox scoped to its trust tier — you approve before anything activates.
</p> </div>`} <div class="mt-10 flex flex-wrap gap-4 text-sm"> ${plugin.homepage && renderTemplate`<a${addAttribute(plugin.homepage, "href")} class="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline">
View source
<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"></path></svg> </a>`} <a href="/docs/guides/plugins/" class="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Build your own →</a> </div> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/plugins/[id].astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/plugins/[id].astro";
const $$url = "/plugins/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  getStaticPaths,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
