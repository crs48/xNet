import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, r as renderSlot, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';
/* empty css                                         */

const $$Astro = createAstro("https://xnet.fyi");
const $$Peek = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Peek;
  const { label = "Open the panel \u2014 for the curious", open = false } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<details class="peek not-prose group my-7 overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04] dark:bg-indigo-500/[0.06] astro-iw2d5fsf"${addAttribute(open, "open")}> <summary class="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 astro-iw2d5fsf"> <svg class="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90 astro-iw2d5fsf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" class="astro-iw2d5fsf"></path> </svg> <span class="astro-iw2d5fsf">${label}</span> </summary> <div class="px-5 pb-5 pt-1 astro-iw2d5fsf"> ${renderSlot($$result, $$slots["default"])} </div> </details> `;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/Peek.astro", void 0);

export { $$Peek as $ };
