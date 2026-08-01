---
'@xnetjs/data': minor
---

Add `proposePromotion`/`proposePromotions` — propose graduating an accumulated
`ext:` overlay key into a core schema property once enough rows carry it. Both
return a proposal carrying a reversible `SchemaLens`, so accepting a promotion
can be undone; nothing mutates and nothing is inferred silently.
