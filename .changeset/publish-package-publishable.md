---
'@xnetjs/publish': minor
---

Publish `@xnetjs/publish` to npm (exploration 0362).

It shipped as `private: true`, but `@xnetjs/cli` — which *is* published —
depends on it, so `npm i @xnetjs/cli` would have installed a package with an
unresolvable dependency. The publish-closure gate caught it.

Making it public is also the right call on its own terms: it is MIT, depends
only on `yjs`, and renders xNet pages to HTML, RSS and sitemaps with no hub in
the read path.
