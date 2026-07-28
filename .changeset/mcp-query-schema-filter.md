---
'@xnetjs/plugins': minor
---

`xnet_query` and `xnet_create` now honour the `schemaId` argument. Both tools
read `schemaId` first and keep `schema` as a deprecated alias — previously they
read only `schema`, so an MCP client that passed `schemaId` (the field name
every node carries) had its filter dropped: `xnet_query` fell through to an
unfiltered `store.list` and answered "my pages" with nodes of every schema,
while `xnet_create` could mint a node with no schema at all.

A call that supplies neither spelling now fails with a clear error instead of
widening to every node.
