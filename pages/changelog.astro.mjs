import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, f as renderComponent, e as renderScript } from '../chunks/astro/server_CDqOe6mW.mjs';
import { $ as $$Base, a as $$Nav, b as $$Footer } from '../chunks/Footer_RAA8cLWV.mjs';
/* empty css                                 */
import { e as entries, u as updated } from '../chunks/changelog_DK13vZqR.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro("https://xnet.fyi");
const $$Gallery = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Gallery;
  const { entryId, items = [], video, galleryLink } = Astro2.props;
  const hasMedia = items.length > 0 || Boolean(video);
  return renderTemplate`${hasMedia && renderTemplate`${maybeRenderHead()}<div class="cl-gallery mb-4 mt-1 astro-6pssnvvj">${items.length > 0 && renderTemplate`<div class="cl-row astro-6pssnvvj" aria-label="Screenshots for this release">${items.map((it) => renderTemplate`<button type="button"${addAttribute([["cl-item", it.type === "cmp" && "cl-item--cmp"], "astro-6pssnvvj"], "class:list")}${addAttribute(entryId, "data-group")}${addAttribute(it.type, "data-type")}${addAttribute(it.after, "data-after")}${addAttribute(it.before, "data-before")}${addAttribute(it.diff, "data-diff")}${addAttribute(it.alt, "data-alt")}${addAttribute(
    it.type === "cmp" ? `Before and after: ${it.alt}. Click to enlarge; hover for before, press and hold for the diff.` : `View screenshot: ${it.alt}`,
    "aria-label"
  )}><span class="cl-item-media astro-6pssnvvj"><img class="cl-item-after astro-6pssnvvj"${addAttribute(it.after, "src")}${addAttribute(it.alt, "alt")} loading="lazy">${it.before && renderTemplate`<img class="cl-item-before astro-6pssnvvj"${addAttribute(it.before, "src")} alt="" aria-hidden="true" loading="lazy">`}${it.diff && renderTemplate`<img class="cl-item-diff astro-6pssnvvj"${addAttribute(it.diff, "src")} alt="" aria-hidden="true" loading="lazy">`}${it.type === "cmp" && renderTemplate`<span class="cl-item-badge astro-6pssnvvj" aria-hidden="true"><span class="b-after astro-6pssnvvj">After</span><span class="b-before astro-6pssnvvj">Before</span>${it.diff && renderTemplate`<span class="b-diff astro-6pssnvvj">Diff</span>`}</span>`}${it.caption && renderTemplate`<span class="cl-item-cap astro-6pssnvvj">${it.caption}</span>`}</span></button>`)}</div>`}${video && renderTemplate`<figure class="cl-video-wrap astro-6pssnvvj"><video class="cl-video astro-6pssnvvj"${addAttribute(video.poster, "poster")} controls muted loop playsinline preload="none"${addAttribute(video.alt, "aria-label")}><source${addAttribute(video.mp4, "src")} type="video/mp4" class="astro-6pssnvvj"></video><figcaption class="cl-media-cap astro-6pssnvvj">${video.alt}</figcaption></figure>`}${galleryLink && renderTemplate`<a class="cl-gallery-link astro-6pssnvvj"${addAttribute(galleryLink.prUrl, "href")} target="_blank" rel="noopener noreferrer">
View all ${galleryLink.count} screenshot${galleryLink.count === 1 ? "" : "s"} on PR #
${galleryLink.pr} →
</a>`}</div>`}`;
}, "/home/runner/work/xNet/xNet/site/src/components/changelog/Gallery.astro", void 0);

const VISUALS_BASE = "https://xnet.fyi/visuals/pr";
const REPO = "https://github.com/crs48/xNet";
function caption(s) {
  return s.label || [s.title, s.name].filter(Boolean).join(" — ") || s.id;
}
async function loadPrGallery(pr, cap = 12) {
  const base = `${VISUALS_BASE}/${pr}`;
  let manifest;
  try {
    const res = await fetch(`${base}/diff-manifest.json`, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return null;
    manifest = await res.json();
  } catch {
    return null;
  }
  const surfaces = [...manifest.stories ?? [], ...manifest.routes ?? []].filter(
    (s) => s.status !== "unchanged" && Boolean(s.after)
  );
  const images = surfaces.slice(0, cap).map((s) => ({
    src: `${base}/${s.after}`,
    alt: caption(s),
    ...s.status === "changed" && s.before ? { before: `${base}/${s.before}` } : {},
    ...s.diff ? { diff: `${base}/${s.diff}` } : {}
  }));
  const videos = (manifest.flows ?? []).filter((f) => f.mp4 && f.poster).map((f) => ({ mp4: `${base}/${f.mp4}`, poster: `${base}/${f.poster}`, alt: caption(f) }));
  const count = images.length + videos.length;
  if (count === 0) return null;
  return { images, videos, prUrl: `${REPO}/pull/${pr}`, galleryUrl: base, count };
}

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const repo = "https://github.com/crs48/xNet";
  const editUrl = `${repo}/blob/main/site/src/data/changelog.ts`;
  function mergeTimeUTC(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm} UTC`;
  }
  const tagColor = {
    app: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    crm: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    finance: "bg-green-500/15 text-green-700 dark:text-green-300",
    tasks: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ai: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    plugins: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    editor: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    sync: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    identity: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    platform: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    performance: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    devtools: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    ci: "bg-teal-500/15 text-teal-700 dark:text-teal-300"
  };
  const usedTags = Object.keys(tagColor).filter((t) => entries.some((e) => e.tags.includes(t)));
  const galleries = await Promise.all(entries.map((e) => e.pr ? loadPrGallery(e.pr) : null));
  const view = entries.map((entry, i) => {
    const gallery = galleries[i];
    const items = [
      ...(gallery?.images ?? []).filter((im) => im.before).map((im) => ({
        type: "cmp",
        after: im.src,
        before: im.before,
        diff: im.diff,
        alt: im.alt
      })),
      ...(gallery?.images ?? []).filter((im) => !im.before).map((im) => ({ type: "img", after: im.src, alt: im.alt })),
      ...(entry.images ?? []).map((im) => ({
        type: "img",
        after: im.src,
        alt: im.alt,
        caption: im.caption
      }))
    ];
    const video = entry.video ? { mp4: entry.video.src, poster: entry.video.poster, alt: entry.video.alt } : gallery?.videos?.[0];
    const galleryLink = gallery && entry.pr ? { prUrl: gallery.prUrl, count: gallery.count, pr: entry.pr } : void 0;
    const dataText = [entry.title, entry.summary, ...entry.highlights].join(" ").toLowerCase();
    const mergeTime = mergeTimeUTC(entry.mergedAt);
    const contributors = entry.authors?.length ? entry.authors : entry.author ? [entry.author] : [];
    return { entry, items, video, galleryLink, dataText, contributors, mergeTime };
  });
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "xNet Changelog \u2014 What's New", "description": `Everything that's shipped in xNet, newest first. ${entries.length} releases, updated ${updated}. Subscribe via RSS or the JSON feed.`, "class": "astro-b3ixuhka" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Nav", $$Nav, { "class": "astro-b3ixuhka" })} ${maybeRenderHead()}<main class="py-24 lg:py-32 astro-b3ixuhka"> <div class="mx-auto max-w-3xl px-6 astro-b3ixuhka"> <!-- Hero --> <div class="mb-10 text-center astro-b3ixuhka"> <h1 class="mb-4 text-4xl font-bold text-gray-800 dark:text-white sm:text-5xl astro-b3ixuhka">What's New</h1> <p class="mx-auto max-w-xl text-lg leading-relaxed text-gray-500 dark:text-gray-400 astro-b3ixuhka">
Everything that's shipped in xNet, newest first.
</p> <div class="mt-5 flex items-center justify-center gap-4 text-sm astro-b3ixuhka"> <a href="/changelog.xml" class="text-indigo-400 hover:underline astro-b3ixuhka">RSS</a> <span class="text-gray-300 dark:text-gray-600 astro-b3ixuhka">·</span> <a href="/changelog.json" class="text-indigo-400 hover:underline astro-b3ixuhka">JSON feed</a> <span class="text-gray-300 dark:text-gray-600 astro-b3ixuhka">·</span> <a${addAttribute(editUrl, "href")} target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline astro-b3ixuhka">Edit on GitHub</a> </div> </div> <!-- Controls: search + tag filter --> <div id="cl-controls" class="mb-10 scroll-mt-24 space-y-3 astro-b3ixuhka"> <input id="cl-search" type="search" placeholder="Search the changelog…" aria-label="Search the changelog" class="w-full rounded-lg border border-border bg-surface/40 px-4 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-indigo-500/50 focus:outline-none dark:text-gray-200 astro-b3ixuhka"> <div id="cl-filters" role="group" aria-label="Filter by category" class="flex flex-wrap gap-1.5 astro-b3ixuhka"> <button type="button" class="cl-filter astro-b3ixuhka" data-tag="all" aria-pressed="true">All</button> ${usedTags.map((tag) => renderTemplate`<button type="button" class="cl-filter astro-b3ixuhka"${addAttribute(tag, "data-tag")} aria-pressed="false">${tag}</button>`)} </div> <p id="cl-empty" hidden class="text-center text-sm text-gray-400 astro-b3ixuhka">No entries match.</p> </div> <!-- Timeline --> <div class="relative astro-b3ixuhka"> <div class="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/40 via-indigo-500/25 to-transparent astro-b3ixuhka"></div> <div class="space-y-12 astro-b3ixuhka"> ${view.map(({ entry, items, video, galleryLink, dataText, contributors, mergeTime }, i) => renderTemplate`<article${addAttribute(entry.id, "id")} class="cl-entry relative pl-10 scroll-mt-24 astro-b3ixuhka"${addAttribute(entry.tags.join(" "), "data-tags")}${addAttribute(dataText, "data-text")}> <div class="absolute left-0 top-1.5 h-[17px] w-[17px] rounded-full bg-indigo-400 ring-4 ring-white dark:ring-[#0a0a0f] astro-b3ixuhka"></div> <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 astro-b3ixuhka"> <time${addAttribute(entry.mergedAt, "datetime")}${addAttribute(entry.mergedAt ? `Merged ${entry.mergedAt}` : void 0, "title")} class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 astro-b3ixuhka">${entry.date}${mergeTime && renderTemplate`<span class="text-gray-300 dark:text-gray-600 astro-b3ixuhka"> · ${mergeTime}</span>`}</time> ${entry.pr && renderTemplate`<a${addAttribute(`${repo}/pull/${entry.pr}`, "href")} target="_blank" rel="noopener noreferrer" class="text-xs text-gray-400 hover:text-indigo-400 hover:underline astro-b3ixuhka">#${entry.pr}</a>`} ${contributors.map((c) => renderTemplate`<a${addAttribute(`https://github.com/${c.login}`, "href")} target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-400 astro-b3ixuhka"${addAttribute(`By ${c.name ?? c.login}`, "title")}> <img${addAttribute(`https://github.com/${c.login}.png?size=40`, "src")} alt="" width="18" height="18" loading="lazy" class="rounded-full astro-b3ixuhka"> ${c.name ?? c.login} </a>`)} </div> <h2 class="group mb-2 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white astro-b3ixuhka"> <a${addAttribute(`#${entry.id}`, "href")} class="hover:text-indigo-400 astro-b3ixuhka">${entry.title}</a> <button type="button" class="cl-copy opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 astro-b3ixuhka"${addAttribute(entry.id, "data-anchor")} aria-label="Copy link to this entry" title="Copy link"> <svg class="h-4 w-4 astro-b3ixuhka" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" class="astro-b3ixuhka"></path></svg> </button> </h2> <p class="mb-4 text-gray-600 dark:text-gray-300 astro-b3ixuhka">${entry.summary}</p> ${entry.hero && renderTemplate`<img${addAttribute(entry.hero.src, "src")}${addAttribute(entry.hero.alt, "alt")}${addAttribute(i === 0 ? "eager" : "lazy", "loading")}${addAttribute(i === 0 ? "high" : void 0, "fetchpriority")} class="mb-4 w-full rounded-xl border border-border astro-b3ixuhka">`} ${renderComponent($$result2, "Gallery", $$Gallery, { "entryId": entry.id, "items": items, "video": video, "galleryLink": galleryLink, "class": "astro-b3ixuhka" })} ${entry.pr && items.length === 0 && !video && renderTemplate`<a${addAttribute(`${repo}/pull/${entry.pr}`, "href")} target="_blank" rel="noopener noreferrer" class="mb-4 inline-flex items-center gap-1 text-sm text-indigo-400 hover:underline astro-b3ixuhka">View PR #${entry.pr} →</a>`} <ul class="mb-4 grid gap-1.5 astro-b3ixuhka"> ${entry.highlights.map((h) => renderTemplate`<li class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 astro-b3ixuhka"> <svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 astro-b3ixuhka" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" class="astro-b3ixuhka"></path></svg> <span class="astro-b3ixuhka">${h}</span> </li>`)} </ul> <div class="flex flex-wrap gap-1.5 astro-b3ixuhka"> ${entry.tags.map((tag) => renderTemplate`<span${addAttribute((`rounded-full px-2 py-0.5 text-xs font-medium ${tagColor[tag] ?? "bg-gray-500/15 text-gray-600 dark:text-gray-300"}` ?? "") + " astro-b3ixuhka", "class")}>${tag}</span>`)} </div> </article>`)} </div> </div> <!-- Pager (populated by the script; hidden when everything fits one page) --> <nav id="cl-pager" hidden class="mt-12 flex flex-wrap items-center justify-center gap-1.5 astro-b3ixuhka" aria-label="Changelog pages"></nav> <p class="mt-16 text-center text-xs text-gray-400 dark:text-gray-500 astro-b3ixuhka">Updated ${updated}</p> </div> </main> ${renderComponent($$result2, "Footer", $$Footer, { "class": "astro-b3ixuhka" })}  <dialog id="cl-lightbox" class="cl-lightbox astro-b3ixuhka" aria-label="Screenshot viewer"> <button type="button" class="cl-lb-close astro-b3ixuhka" data-lb="close" aria-label="Close">✕</button> <button type="button" class="cl-lb-nav cl-lb-prev astro-b3ixuhka" data-lb="prev" aria-label="Previous">‹</button> <div class="cl-lb-stage astro-b3ixuhka" id="cl-lb-stage"> <img class="cl-lb-after astro-b3ixuhka" alt=""> <img class="cl-lb-before astro-b3ixuhka" alt="" aria-hidden="true"> <img class="cl-lb-diff astro-b3ixuhka" alt="" aria-hidden="true"> <span class="cl-lb-badge astro-b3ixuhka" aria-hidden="true"> <span class="b-after astro-b3ixuhka">After</span> <span class="b-before astro-b3ixuhka">Before</span> <span class="b-diff astro-b3ixuhka">Diff</span> </span> </div> <button type="button" class="cl-lb-nav cl-lb-next astro-b3ixuhka" data-lb="next" aria-label="Next">›</button> <p class="cl-lb-cap astro-b3ixuhka" aria-live="polite"></p> </dialog> ` })}  ${renderScript($$result, "/home/runner/work/xNet/xNet/site/src/pages/changelog/index.astro?astro&type=script&index=0&lang.ts")}`;
}, "/home/runner/work/xNet/xNet/site/src/pages/changelog/index.astro", void 0);

const $$file = "/home/runner/work/xNet/xNet/site/src/pages/changelog/index.astro";
const $$url = "/changelog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
