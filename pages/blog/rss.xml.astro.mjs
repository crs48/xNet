import { b as buildBlogRss, c as publishedPosts } from '../../chunks/blog-feed_BIVCtqij.mjs';
export { renderers } from '../../renderers.mjs';

const GET = () => new Response(buildBlogRss(publishedPosts()), {
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
