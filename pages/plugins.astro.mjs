import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, f as renderComponent, F as Fragment, e as renderScript } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$SectionHeader } from '../chunks/SectionHeader_C1QfMrnP.mjs';
import { s as searchText, t as tierLabel, p as priceLabel, a as plugins, f as firstParty, c as community, b as categories } from '../chunks/plugins_DBGjROUw.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$PluginCard = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$PluginCard;
  const { plugin } = Astro2.props;
  const isBuiltIn = plugin.tier === "bundled";
  const setupRequired = isBuiltIn && plugin.autoInstalled === false;
  const tags = (plugin.keywords ?? []).slice(0, 3);
  const paid = plugin.pricing && plugin.pricing.mode !== "free";
  return renderTemplate`${maybeRenderHead()}<a${addAttribute(`/plugins/${plugin.id}/`, "href")} class="animate-on-scroll group flex flex-col rounded-xl border border-border bg-surface/30 p-6 transition-all hover:-translate-y-0.5 hover:border-indigo-500/50 hover:bg-indigo-500/[0.04] hover:shadow-lg hover:shadow-indigo-500/5"${addAttribute(searchText(plugin), "data-search")}${addAttribute(plugin.category, "data-category")}> <div class="mb-3 flex items-start justify-between gap-3"> <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors"> ${plugin.name} </h3> <span class="flex shrink-0 flex-wrap items-center justify-end gap-1.5"> ${setupRequired && renderTemplate`<span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300" title="Ships in the repo but is not auto-installed — set it up explicitly.">
Setup required
</span>`} <span${addAttribute(`rounded-full border px-2.5 py-0.5 text-xs font-medium ${isBuiltIn ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`, "class")}> ${tierLabel(plugin.tier)} </span> </span> </div> <p class="flex-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-3"> ${plugin.description} </p> ${tags.length > 0 && renderTemplate`<div class="mt-4 flex flex-wrap gap-1.5"> ${tags.map((t) => renderTemplate`<span class="rounded bg-border/60 px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400"> ${t} </span>`)} </div>`} <div class="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500"> <span>by ${plugin.author}</span> <span class="flex items-center gap-2"> ${plugin.stars != null && renderTemplate`<span>★ ${plugin.stars}</span>`} <span${addAttribute(paid ? "font-medium text-gray-600 dark:text-gray-300" : "", "class")}> ${priceLabel(plugin.pricing)} </span> </span> </div> </a>`;
}, "/home/runner/work/xNet/xNet/site/src/components/plugins/PluginCard.astro", void 0);

const $$Plugins = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Plugins \u2014 Marketplace", "description": "Everything xNet does out of the box, and everything the community builds. Browse plugins and connectors, or publish your own." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="py-16 lg:py-24"> <div class="mx-auto max-w-6xl px-6"> <div class="text-center"> ${renderComponent($$result2, "SectionHeader", $$SectionHeader, { "title": "Plugins", "subtitle": "Extend xNet. Built-in power, community ingenuity \u2014 all governed by the same capability and trust model.", "align": "center" })} <div class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400"> <span>${plugins.length} plugins</span> <span class="hidden sm:inline">·</span> <span>${firstParty.length} built-in</span> <span class="hidden sm:inline">·</span> <span>${community.length} from the community</span> </div> </div> <!-- Toolbar: search + category filter --> <div class="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"> <div class="relative w-full sm:max-w-xs"> <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"> <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path> </svg> <input id="plugin-search" type="search" placeholder="Search plugins…" class="w-full rounded-lg border border-border bg-surface/50 py-2 pl-9 pr-3 text-sm text-gray-800 dark:text-gray-200 outline-none transition-colors focus:border-indigo-500/60"> </div> <div id="plugin-filters" class="flex flex-wrap gap-2"> <button type="button" data-category="all" class="plugin-filter rounded-full border border-indigo-500/50 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300" aria-pressed="true">
All
</button> ${categories.map((c) => renderTemplate`<button type="button"${addAttribute(c, "data-category")} class="plugin-filter rounded-full border border-border px-3 py-1 text-xs font-medium capitalize text-gray-500 hover:border-indigo-500/40 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200" aria-pressed="false"> ${c} </button>`)} </div> </div> <!-- Built-in --> <section data-section class="mt-12"> <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100">Built in</h2> <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Maintained by the xNet core team and shipped with the app.</p> <div class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"> ${firstParty.map((p) => renderTemplate`${renderComponent($$result2, "PluginCard", $$PluginCard, { "plugin": p })}`)} </div> <p data-empty class="mt-6 hidden text-sm text-gray-400">No built-in plugins match your search.</p> </section> <!-- Community --> <section data-section class="mt-16"> <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100">From the community</h2> <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Built and maintained by developers like you, installed in a tier-appropriate sandbox.</p> ${community.length > 0 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": ($$result3) => renderTemplate` <div class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"> ${community.map((p) => renderTemplate`${renderComponent($$result3, "PluginCard", $$PluginCard, { "plugin": p })}`)} </div> <p data-empty class="mt-6 hidden text-sm text-gray-400">No community plugins match your search.</p> ` })}` : renderTemplate`<div class="mt-6 rounded-xl border border-dashed border-border bg-surface/20 p-10 text-center"> <p class="text-gray-600 dark:text-gray-300">No community plugins yet — yours could be the first.</p> <a href="#publish" class="mt-3 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
Publish a plugin →
</a> </div>`} </section> <!-- Publish CTA --> <section id="publish" class="mt-24 scroll-mt-24 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-8 text-center sm:p-12"> <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Publish your plugin</h2> <p class="mx-auto mt-3 max-w-xl text-gray-500 dark:text-gray-400">
Scaffold a project in seconds, ship it from your own repo, and get listed with a single
          pull request. No npm release dance, no servers — just your code and one JSON entry.
</p> <div class="mx-auto mt-6 max-w-md rounded-lg border border-border bg-[var(--lp-code-bg)] px-4 py-3 text-left font-mono text-sm text-gray-700 dark:text-gray-300"> <span class="select-none text-gray-400">$ </span>npx xnet plugin scaffold com.you.cool-plugin
</div> <div class="mt-6 flex flex-wrap justify-center gap-3"> <a href="/docs/guides/plugins/" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
Read the guide
</a> <a href="https://github.com/crs48/xNet/tree/main/registry" class="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:border-indigo-500/50 hover:bg-surface">
Submit a plugin
</a> </div> </section> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ${renderScript($$result2, "/home/runner/work/xNet/xNet/site/src/pages/plugins.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/plugins.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/plugins.astro";
const $$url = "/plugins";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Plugins,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
