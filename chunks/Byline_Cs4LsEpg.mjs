import { c as createAstro, a as createComponent, m as maybeRenderHead, b as addAttribute, d as renderTemplate, f as renderComponent, F as Fragment, u as unescapeHTML } from './astro/server_CDqOe6mW.mjs';
import { p as postAuthors, a as postUrl } from './blog-feed_BIVCtqij.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Astro = createAstro("https://xnet.fyi");
const $$Byline = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Byline;
  const { post, compact = false } = Astro2.props;
  const authors = postAuthors(post);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.pubDate,
    url: postUrl(post),
    author: authors.map((a) => ({
      "@type": "Person",
      name: a.name,
      ...a.href ? { url: a.href } : {}
    }))
  };
  const avatarSize = compact ? 18 : 24;
  return renderTemplate`${maybeRenderHead()}<div${addAttribute([
    "not-prose flex flex-wrap items-center",
    compact ? "gap-1.5 text-xs" : "gap-2 text-sm text-gray-500 dark:text-gray-400"
  ], "class:list")}> <span${addAttribute(["flex", compact ? "-space-x-1.5" : "-space-x-2"], "class:list")}> ${authors.map((a) => renderTemplate`<img${addAttribute(a.avatar, "src")}${addAttribute(a.name, "alt")}${addAttribute(avatarSize, "width")}${addAttribute(avatarSize, "height")} loading="lazy"${addAttribute([
    "rounded-full",
    compact ? "ring-1 ring-white dark:ring-gray-900" : "ring-2 ring-white dark:ring-gray-900"
  ], "class:list")}>`)} </span> ${authors.map((a, i) => renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate`${i > 0 && renderTemplate`<span aria-hidden="true">${a.ai ? "with" : "\xB7"}</span>`}${compact || !a.href ? renderTemplate`<span class="font-medium">${a.name}</span>` : renderTemplate`<a${addAttribute(a.href, "href")} target="_blank" rel="noopener noreferrer" class="font-medium text-gray-600 transition-colors hover:text-indigo-500 dark:text-gray-300 dark:hover:text-indigo-400"> ${a.name} </a>`}` })}`)} </div> ${!compact && renderTemplate(_a || (_a = __template(['<script type="application/ld+json">', "<\/script>"])), unescapeHTML(JSON.stringify(jsonLd)))}`;
}, "/home/runner/work/xNet/xNet/site/src/components/blog/Byline.astro", void 0);

export { $$Byline as $ };
