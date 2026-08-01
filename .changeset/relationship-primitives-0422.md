---
'@xnetjs/data': minor
---

Relationships can now record what two people actually do together, instead of
just what you call them.

Words like "spouse", "friend" and "coworker" are shorthand for a bundle of
typical activities, and `Relationship.kind` only ever stored the shorthand. Two
new schemas capture the part it was dropping: `RelationshipPrimitive` is one
term in an open, user-extensible vocabulary of shared activities ("make things",
"have hard conversations", "cohabitate"), and `Practice` records one such
activity between a pair.

The label is now derived rather than stored. `deriveBundle()` in `@xnetjs/crm`
reads which bundle a pair resembles from the activities they share, and returns
the **set difference** — activities common to that kind of relationship they
don't share — as possibilities to consider. It never grades the relationship
itself; a new `scored intimacy` CI rule and Charter §6 clause keep it that way.

`Practice` defaults to `private` visibility rather than `inherit`, because a
practice is a claim about a pair authored by one side. Erasing a contact deletes
their practices outright (`practiceErasureIds()`) rather than anonymizing them —
for this record the claim is the payload, so a blanked practice would still
disclose through the other end of the edge.
