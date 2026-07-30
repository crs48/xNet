# @xnetjs/publish

## 0.1.0

### Minor Changes

- [#578](https://github.com/crs48/xNet/pull/578) [`437699c`](https://github.com/crs48/xNet/commit/437699c62255b1bcf24d7a8739fef0a7b530b702) Thanks [@crs48](https://github.com/crs48)! - Publish `@xnetjs/publish` to npm (exploration 0362).

  It shipped as `private: true`, but `@xnetjs/cli` — which _is_ published —
  depends on it, so `npm i @xnetjs/cli` would have installed a package with an
  unresolvable dependency. The publish-closure gate caught it.

  Making it public is also the right call on its own terms: it is MIT, depends
  only on `yjs`, and renders xNet pages to HTML, RSS and sitemaps with no hub in
  the read path.

- [#594](https://github.com/crs48/xNet/pull/594) [`0f26bc9`](https://github.com/crs48/xNet/commit/0f26bc96b9261a8ee0589d94dd276c78017dcc1a) Thanks [@crs48](https://github.com/crs48)! - Add shadow-publication support to `@xnetjs/publish` (exploration 0362).

  `HeadOptions` gains `robots` and `feedAutodiscovery`, so a duplicate of a live
  publication can be rendered `noindex, nofollow` with no RSS autodiscovery tag —
  a staging copy that cannot be indexed, and that no reader can accidentally
  subscribe to. A noindex publication also stops advertising a sitemap in its
  `robots.txt`, which would otherwise be a mixed signal.

  `@xnetjs/data` re-exports `PublicationSchema` from the package root, so a build
  script can validate posts against the real schema.
