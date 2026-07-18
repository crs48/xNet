import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate } from './astro/server_CDqOe6mW.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$WatchTheOriginal = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$WatchTheOriginal;
  const { href, title, author, length } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<aside class="not-prose my-12"> <a${addAttribute(href, "href")} target="_blank" rel="noopener noreferrer" class="group block overflow-hidden rounded-2xl border border-border bg-surface/30 transition-all hover:border-rose-500/40 hover:bg-surface/50 dark:bg-surface/40"> <!-- poster: original art, no YouTube thumbnail (which would phone home) --> <div class="relative aspect-[16/7] w-full overflow-hidden bg-[#0c0609]"> <svg class="absolute inset-0 h-full w-full" viewBox="0 0 1040 455" preserveAspectRatio="xMidYMid slice" aria-hidden="true"> <defs> <linearGradient id="vbg" x1="0" y1="0" x2="0" y2="1"> <stop offset="0%" stop-color="#150b11"></stop> <stop offset="100%" stop-color="#0a0608"></stop> </linearGradient> <radialGradient id="vglow" cx="50%" cy="50%" r="50%"> <stop offset="0%" stop-color="#fb7185" stop-opacity="0.5"></stop> <stop offset="60%" stop-color="#f43f5e" stop-opacity="0.12"></stop> <stop offset="100%" stop-color="#f43f5e" stop-opacity="0"></stop> </radialGradient> </defs> <rect width="1040" height="455" fill="url(#vbg)"></rect> <!-- a rising line chart that the play button sits on: "the richest country" --> <polyline points="0,360 130,348 260,352 390,300 520,312 650,236 780,250 910,150 1040,96" fill="none" stroke="#3f2a33" stroke-width="2.5" opacity="0.8"></polyline> <circle cx="520" cy="228" r="150" fill="url(#vglow)"></circle> <!-- play triangle with the cosmic-X notched into it --> <g transform="translate(520 228)"> <circle cx="0" cy="0" r="52" fill="#0c0609" stroke="#fb7185" stroke-width="2" opacity="0.95"></circle> <path d="M -16 -24 L 26 0 L -16 24 Z" fill="#fb7185"></path> </g> </svg> <span class="absolute bottom-3 right-3 rounded bg-black/55 px-2 py-1 font-mono text-xs text-rose-100 backdrop-blur-sm"> ${length} </span> </div> <div class="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"> <div class="min-w-0"> <p class="text-xs font-medium uppercase tracking-wide text-rose-500 dark:text-rose-400">
Watch the original
</p> <p class="mt-1 truncate font-semibold text-gray-900 dark:text-white">${title}</p> <p class="text-sm text-gray-500 dark:text-gray-400">${author}</p> </div> <span class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-600 transition-colors group-hover:bg-rose-500/20 dark:text-rose-300">
YouTube
<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"></path> </svg> </span> </div> </a> <p class="mt-2 px-1 text-xs text-gray-400 dark:text-gray-500">
We link out instead of embedding a player, so this page still loads nothing
    from YouTube until you choose to go there. That restraint is the essay in
    miniature.
</p> </aside>`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/WatchTheOriginal.astro", void 0);

export { $$WatchTheOriginal as $ };
