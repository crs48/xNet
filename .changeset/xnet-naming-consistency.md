---
'@xnetjs/plugins': patch
'@xnetjs/slack-compat': patch
'@xnetjs/cli': patch
---

Spell the brand `xNet` consistently in user-visible copy

The repo had drifted between `xNet` and `XNet` in prose. Everything a
consumer can read now uses the lowercase-x, uppercase-N form.

- `@xnetjs/plugins`: the managed AI provider's display name is now
  `'xNet Cloud'` (was `'XNet Cloud'`), along with its connector label and
  setup hints. Cosmetic — the managed tier is selected by its `'managed'`
  id, not by this string, and nothing persists it.
- `@xnetjs/cli`: `xnet bridge` help text and its pairing instructions.
- `@xnetjs/slack-compat`: published package description.

No exported names, signatures, or wire contracts changed. Code identifiers
(`XNetProvider`, `useXNet`, `XNetKit`) keep their existing casing.
