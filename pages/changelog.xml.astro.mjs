import { e as entries } from '../chunks/changelog_DK13vZqR.mjs';
import { a as buildRssXml } from '../chunks/changelog-feed_ChjrIiqz.mjs';
export { renderers } from '../renderers.mjs';

const GET = () => new Response(buildRssXml(entries), {
  headers: {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
