---
'@xnetjs/react': minor
---

Add `@xnetjs/react/queries` with `DataBridgeProvider`, `useDataBridge`, and the existing `useQuery` hook. Hosts can supply an initialized, restricted bridge without starting identity, storage, or sync. The provider does not enforce permissions itself; the host must authorize every record exposed through its bridge.
