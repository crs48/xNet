# Deploying real-time calls (exploration 0167)

Mesh calls need no media infrastructure: signaling rides the hub's existing
pub/sub WebSocket on `call:{roomId}` topics, and audio/video flows directly
between peers over DTLS-SRTP. Two optional components improve reachability
and scale.

## STUN / TURN (recommended for WAN deployments)

~15–30% of WAN peer pairs cannot hole-punch and need a TURN relay. The
client defaults to a public STUN server; co-deploy
[coturn](https://github.com/coturn/coturn) next to the hub for relay
fallback:

```bash
docker run -d --network=host \
  -e TURN_USERNAME=xnet -e TURN_PASSWORD=<secret> \
  coturn/coturn \
  --no-cli --fingerprint --lt-cred-mech \
  --realm=turn.your-hub.example \
  --listening-port=3478
```

Then point clients at it via the ICE server config in
`apps/web/src/comms/CallDock.tsx` (`ICE_SERVERS`) — or surface it through
hub settings:

```ts
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:turn.your-hub.example:3478', username: 'xnet', credential: '<secret>' }
]
```

LAN-only deployments need neither: host candidates plus mDNS connect
directly.

## Mesh ceiling and the SFU escalation path

The mesh tier caps at **4 video / 8 audio participants**
(`MESH_MAX_*_PARTICIPANTS` in `packages/comms/src/calls/types.ts`); the UI
refuses joins beyond capacity. Rooms beyond the ceiling are the SFU tier
from exploration 0167: co-deploy a self-hosted
[LiveKit](https://docs.livekit.io/) server and mint access tokens from the
hub gated on the `call/join` UCAN capability
(`packages/hub/src/auth/capabilities.ts`). The CallManager's
`SignalingTransport` and membership protocol stay unchanged — only the
media path switches. This tier is not yet implemented; see the 0167
checklist.
