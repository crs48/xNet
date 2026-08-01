---
'@xnetjs/brain': minor
---

`@xnetjs/brain` is now published.

It was private because nothing outside the monorepo used it. `@xnetjs/plugins`
and `@xnetjs/cli` now do, and a published package cannot depend on an
unpublished one.

The package is unchanged by this: it has **zero runtime dependencies** and is
structural over whatever store, index and schema registry you hand it — which is
what makes it safe to publish rather than a new transitive burden. Its two
previous `dependencies` (`@xnetjs/data`, `@xnetjs/vectors`) were vestigial; the
source imports neither, and `@xnetjs/vectors` is now a devDependency used only
by a test.
