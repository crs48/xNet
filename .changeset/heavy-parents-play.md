---
'@xnetjs/react': minor
---

New `usePresence<T>(awareness, initialState)` hook: typed, throttled (~30fps)
ephemeral peer state over Yjs Awareness. Pairs with `useNode().awareness` for
live cursors, positions, and "who's here" UI without writing the persisted
change log. Peers are evicted on disconnect; unmount retracts only the fields
the hook owns.
