---
'@xnetjs/core': minor
'@xnetjs/data': patch
'@xnetjs/plugins': patch
'@xnetjs/react': patch
---

Add the shared Last-Write-Wins ordering module to `@xnetjs/core`
(`compareChangeApplicationOrder`, `compareLwwStamps`, `lwwWins`,
`lwwUpdateGuardSql`, `LwwStamp`) — the single canonical LWW comparison used
across the stack (protocol §L1.7).

`@xnetjs/data`, `@xnetjs/plugins`, and `@xnetjs/react` adopt it and receive
internal decompositions of their most-churned modules (NodeStore query
compiler/hydration/transaction execution, ai-surface tool registry and
resource URI router, XNetProvider provider units). No public API changes in
those packages.
