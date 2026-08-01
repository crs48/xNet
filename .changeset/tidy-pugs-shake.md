---
'@xnetjs/data': minor
---

Export the `NodeProperties` type from the root barrel. It was already exported
from `@xnetjs/data/schema` and is the parameter type of every `RecordLens`
`forward`/`backward`, so anyone writing a lens against the root entry point had
no way to name it.
