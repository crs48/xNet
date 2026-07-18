import { e as entries } from '../chunks/changelog_DK13vZqR.mjs';
import { b as buildJsonFeed } from '../chunks/changelog-feed_ChjrIiqz.mjs';
export { renderers } from '../renderers.mjs';

const GET = () => new Response(JSON.stringify(buildJsonFeed(entries), null, 2), {
  headers: {
    "Content-Type": "application/feed+json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
