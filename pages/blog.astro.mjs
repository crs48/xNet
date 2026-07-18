import { a as createComponent, f as renderComponent, d as renderTemplate, m as maybeRenderHead, b as addAttribute } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
import { $ as $$PirateArt } from '../chunks/PirateArt_65Lw5iEc.mjs';
import { $ as $$MycelialArt } from '../chunks/MycelialArt_MsmkUcRA.mjs';
import { $ as $$StarArt } from '../chunks/StarArt_BdL0mG9A.mjs';
import { $ as $$LeverArt } from '../chunks/LeverArt_BWZRssTN.mjs';
import { $ as $$DustArt } from '../chunks/DustArt_DrFB-vOR.mjs';
import { $ as $$ForestArt } from '../chunks/ForestArt_yhl_gdQF.mjs';
import { $ as $$LoomArt } from '../chunks/LoomArt_BU1ADpFy.mjs';
import { $ as $$HookArt } from '../chunks/HookArt_BWsfJnN4.mjs';
import { $ as $$TillerArt } from '../chunks/TillerArt_-TSVMd6V.mjs';
import { $ as $$WorkshopArt } from '../chunks/WorkshopArt_CYvETef9.mjs';
import { $ as $$VaultArt } from '../chunks/VaultArt_CXxIVagm.mjs';
import { $ as $$TimeoutArt } from '../chunks/TimeoutArt_CYFxcC9U.mjs';
import { $ as $$WeightsArt } from '../chunks/WeightsArt_Bc9BC53X.mjs';
import { $ as $$BrickArt } from '../chunks/BrickArt_tH-4V9S7.mjs';
import { $ as $$DisguiseArt } from '../chunks/DisguiseArt_BRUx6vM4.mjs';
import { $ as $$Byline } from '../chunks/Byline_Cs4LsEpg.mjs';
import { c as publishedPosts, f as formatPostDate } from '../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const posts = publishedPosts();
  const heroArt = {
    "people-in-disguise": $$DisguiseArt,
    "clutch-power": $$BrickArt,
    "weights-you-can-hold": $$WeightsArt,
    timeout: $$TimeoutArt,
    "the-vault-and-the-view": $$VaultArt,
    "the-workshop-and-the-walled-garden": $$WorkshopArt,
    "hand-on-the-tiller": $$TillerArt,
    "the-tip-of-the-hook": $$HookArt,
    "a-great-pirate-age": $$PirateArt,
    "data-should-work-like-soil": $$MycelialArt,
    "the-gentlest-furnace": $$StarArt,
    "the-right-to-say-no": $$LeverArt,
    "the-desert-that-feeds-the-forest": $$DustArt,
    "the-forest-and-the-field": $$ForestArt,
    "the-loom-you-can-read": $$LoomArt
  };
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Blog \u2014 xNet", "description": "Essays on local-first software, data ownership, and the open web." }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, {})} ${maybeRenderHead()}<main class="mx-auto max-w-3xl px-6 py-20 lg:py-28"> <header class="mb-12"> <div class="flex items-center justify-between gap-4"> <h1 class="text-4xl font-bold tracking-tight text-gray-900 dark:text-white lg:text-5xl">
Blog
</h1> <a href="/blog/rss.xml" class="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-500 hover:border-indigo-500/50 hover:text-gray-900 dark:hover:text-white transition-all"> <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"> <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20S4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 4.95a10.61 10.61 0 0 1 10.61 10.61h-2.83A7.78 7.78 0 0 0 4 12.22V9.39Z"></path> </svg>
RSS
</a> </div> <p class="mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
Field notes from the open web — on owning your data, local-first software,
        and the kind of internet worth building.
</p> </header> ${posts.length === 0 ? renderTemplate`<p class="rounded-2xl border border-border bg-surface/30 p-8 text-gray-500 dark:bg-surface/40 dark:text-gray-400">
The log is being written. First dispatch soon.
</p>` : renderTemplate`<ul class="space-y-4"> ${posts.map((post) => {
    const Art = heroArt[post.slug];
    return renderTemplate`<li> <a${addAttribute(`/blog/${post.slug}`, "href")} class="group block overflow-hidden rounded-2xl border border-border bg-surface/20 transition-all hover:border-indigo-500/40 hover:bg-surface/40"> ${Art && renderTemplate`<div class="relative h-40 w-full overflow-hidden border-b border-border sm:h-48"> ${renderComponent($$result2, "Art", Art, { "class": "block h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]" })} </div>`} <div class="p-6 lg:p-8"> <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500"> <time${addAttribute(post.pubDate, "datetime")}>${formatPostDate(post.pubDate)}</time> <span aria-hidden="true">·</span> <span>${post.readingMinutes} min read</span> ${post.tags.map((tag) => renderTemplate`<span class="rounded-full border border-border px-2 py-0.5 font-mono lowercase"> ${tag} </span>`)} </div> <h2 class="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"> ${post.title} </h2> <p class="mt-2 text-gray-600 dark:text-gray-300 leading-relaxed"> ${post.description} </p> <div class="mt-4 text-gray-500 dark:text-gray-400"> ${renderComponent($$result2, "Byline", $$Byline, { "post": post, "compact": true })} </div> <span class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
Read
<svg class="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"></path> </svg> </span> </div> </a> </li>`;
  })} </ul>`} </main> ${renderComponent($$result2, "Footer", $$Footer, {})} ` })}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/blog/index.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/blog/index.astro";
const $$url = "/blog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
