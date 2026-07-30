---
'@xnetjs/cli': patch
'@xnetjs/plugins': patch
---

Correct the deployed web app's origin in the agent-bridge origin examples: the
PWA lives at `https://xnet.fyi/app`, so the origin to allow is
`https://xnet.fyi` — not the nonexistent `app.xnet.fyi`. Updates `xnet bridge
serve|install --allow-origin` help text and the `appOrigin` doc example.
