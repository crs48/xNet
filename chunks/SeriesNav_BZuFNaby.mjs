import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';
import { s as seriesNeighbors } from './blog-feed_BIVCtqij.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$SeriesNav = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SeriesNav;
  const { slug } = Astro2.props;
  const { previous, next } = seriesNeighbors(slug);
  return renderTemplate`${(previous || next) && renderTemplate`${maybeRenderHead()}<nav aria-label="More in this series" class="mx-auto max-w-3xl px-6 pb-16"><div class="border-t border-border pt-8"><p class="mb-4 font-mono text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
More from the blog
</p><div class="grid gap-4 sm:grid-cols-2">${previous ? renderTemplate`<a${addAttribute(`/blog/${previous.slug}`, "href")} rel="prev" class="group flex flex-col rounded-2xl border border-border bg-surface/20 p-5 transition-all hover:border-indigo-500/40 hover:bg-surface/40"><span class="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400"><svg class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"></path></svg>
Previous
</span><span class="mt-2 font-bold tracking-tight text-gray-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">${previous.title}</span></a>` : renderTemplate`<span class="hidden sm:block" aria-hidden="true"></span>`}${next ? renderTemplate`<a${addAttribute(`/blog/${next.slug}`, "href")} rel="next" class="group flex flex-col rounded-2xl border border-border bg-surface/20 p-5 text-right transition-all hover:border-indigo-500/40 hover:bg-surface/40 sm:col-start-2"><span class="inline-flex items-center justify-end gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
Next
<svg class="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"></path></svg></span><span class="mt-2 font-bold tracking-tight text-gray-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">${next.title}</span></a>` : renderTemplate`<span class="hidden sm:block" aria-hidden="true"></span>`}</div></div></nav>`}`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/SeriesNav.astro", void 0);

export { $$SeriesNav as $ };
