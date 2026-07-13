---
'@xnetjs/sdk': patch
---

Document the `createClient` entry foot-gun: it returns an identity only —
docs now point at `createXNetClient` / `<XNetProvider>` for the full client,
and at `examples/minimal-app` for the smallest complete app.
