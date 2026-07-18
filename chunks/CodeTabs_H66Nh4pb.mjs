import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, u as unescapeHTML, e as renderScript } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$CodeTabs = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CodeTabs;
  const { tabs, group = "default" } = Astro2.props;
  const uid = `ct-${Math.random().toString(36).slice(2, 9)}`;
  return renderTemplate`${maybeRenderHead()}<div class="code-tabs min-w-0 overflow-hidden rounded-xl border border-border bg-code-bg"${addAttribute(group, "data-group")}${addAttribute(uid, "data-uid")}> <div class="flex items-center gap-1 border-b border-border bg-surface/50 px-2 py-1.5" role="tablist"> ${tabs.map((tab, i) => renderTemplate`<button type="button" role="tab"${addAttribute(i, "data-tab")}${addAttribute(i === 0 ? "true" : "false", "aria-selected")} class="code-tab rounded-md px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300 aria-selected:bg-surface aria-selected:text-gray-900 dark:aria-selected:text-white"> ${tab.label} </button>`)} </div> ${tabs.map((tab, i) => renderTemplate`<div class="code-panel group relative"${addAttribute(i, "data-panel")}${addAttribute(i !== 0, "hidden")}> ${tab.filename && renderTemplate`<div class="border-b border-border px-4 py-2 text-xs font-mono text-gray-500">${tab.filename}</div>`} <pre class="lp-code overflow-x-auto p-5 font-mono text-sm leading-relaxed"><code>${unescapeHTML(tab.code)}</code></pre> <button class="copy-btn absolute right-3 top-3 rounded-md border border-border bg-surface px-2 py-1 text-xs text-gray-500 opacity-0 transition-opacity hover:text-gray-700 dark:hover:text-gray-300 group-hover:opacity-100" aria-label="Copy code">
Copy
</button> </div>`)} </div> ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/components/ui/CodeTabs.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/components/ui/CodeTabs.astro", void 0);

export { $$CodeTabs as $ };
