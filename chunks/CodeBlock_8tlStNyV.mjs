import { c as createAstro, a as createComponent, m as maybeRenderHead, d as renderTemplate, u as unescapeHTML } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$CodeBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CodeBlock;
  const { filename, code } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<div class="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-code-bg"> ${filename && renderTemplate`<div class="flex items-center border-b border-border bg-surface/50 px-4 py-2"> <div class="flex items-center gap-1.5 mr-3"> <span class="h-2.5 w-2.5 rounded-full bg-[#ff5f57]"></span> <span class="h-2.5 w-2.5 rounded-full bg-[#febc2e]"></span> <span class="h-2.5 w-2.5 rounded-full bg-[#28c840]"></span> </div> <span class="text-xs font-mono text-gray-500">${filename}</span> </div>`} <div class="relative"> <pre class="lp-code overflow-x-auto p-5 font-mono text-sm leading-relaxed"><code>${unescapeHTML(code)}</code></pre> <button class="copy-btn absolute right-3 top-3 rounded-md border border-border bg-surface px-2 py-1 text-xs text-gray-500 opacity-0 transition-opacity hover:text-gray-700 dark:hover:text-gray-300 group-hover:opacity-100" aria-label="Copy code">
Copy
</button> </div> </div>`;
}, "/home/runner/work/xNet/xNet/site/src/components/ui/CodeBlock.astro", void 0);

export { $$CodeBlock as $ };
