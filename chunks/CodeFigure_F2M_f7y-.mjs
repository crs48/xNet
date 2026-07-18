import { c as createAstro, a as createComponent, m as maybeRenderHead, d as renderTemplate, u as unescapeHTML } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$CodeFigure = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CodeFigure;
  const { code, filename, caption } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<figure class="not-prose my-6"> <div class="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-code-bg"> ${filename && renderTemplate`<div class="border-b border-border px-4 py-2 font-mono text-xs text-gray-500"> ${filename} </div>`} <div class="relative"> <pre class="lp-code overflow-x-auto p-5 font-mono text-sm leading-relaxed"><code>${unescapeHTML(code)}</code></pre> <button class="copy-btn absolute right-3 top-3 rounded-md border border-border bg-surface px-2 py-1 text-xs text-gray-500 opacity-0 transition-opacity hover:text-gray-700 group-hover:opacity-100 dark:hover:text-gray-300" aria-label="Copy code">
Copy
</button> </div> </div> ${caption && renderTemplate`<figcaption class="mt-2.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400"> ${caption} </figcaption>`} </figure>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/CodeFigure.astro", void 0);

export { $$CodeFigure as $ };
