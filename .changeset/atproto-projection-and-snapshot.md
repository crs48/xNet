---
"@xnetjs/data": minor
"@xnetjs/sync": minor
---

Play well with the ATmosphere (exploration 0389). `@xnetjs/data` gains
`RecordLens` — a node↔lexicon mapping that preserves foreign fields another app
wrote (unlike `SchemaLens`, whose one-way `backward` would eat them under
`putRecord`'s whole-object replace) — a concrete `pageToDocumentLens` projecting
a Page onto the adopted `site.standard.document` lexicon with one minted
`fyi.xnet.richBody` block, an authoring-time `publish` guard that flags
unprojectable properties (floats, formulas) at `defineSchema` time, and an
`AtmospherePublishState` machine encoding the publish one-way door (Withdraw,
never make-private; gated content never crosses to the public rail).
`@xnetjs/sync` gains signed `SpaceSnapshot` — an order-independent, verifiable
checkpoint over a Space frontier — the shared primitive that bounded replay,
anti-entropy, and encrypted atmosphere backup all needed.
