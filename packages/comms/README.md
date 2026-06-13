# @xnetjs/comms

Real-time communications for xNet: presence rooms, chat, calls, and the notification inbox. See explorations 0167/0168.

Four layers, all local-first. Presence and calls ride on Yjs Awareness and hub pub/sub; chat messages are signed nodes in the graph; the notifier derives an inbox from the change log.

## Layers

| Layer       | Description                                                           |
| ----------- | --------------------------------------------------------------------- |
| `presence/` | The `Room` primitive over Yjs Awareness — rosters, typing, call state |
| `chat/`     | Channels, DMs, and messages as signed nodes                           |
| `notify/`   | Local-first notifier (rules over the change log) + the inbox          |
| `calls/`    | WebRTC mesh calls signaled over hub pub/sub topics                    |

## Features

- **Presence** -- `createRoomManager`: rosters, typing indicators, and call presence over an `AwarenessLike` provider; helpers like `typingPeers`, `peersInCall`, `presentDids`
- **Chat** -- `createChannel`, `sendMessage`, `editMessage`, `redactMessage`, `ensureDmChannel`, and a `channelHistoryQuery`; deterministic DM ids via `dmChannelId`
- **Notify** -- `evaluateChange` turns change-log events into notifications; the inbox tracks unread/snooze/DND/watermarks (`unreadCount`, `shouldAlert`, `deriveBadges`)
- **Calls** -- `createCallManager` over a `SignalingTransport` (WebSocket or in-process loopback bus), with mesh-capacity ceilings (`meshCapacity`, `MESH_MAX_*`)

## Usage

```typescript
import { createChannel, sendMessage } from '@xnetjs/comms'

const channel = await createChannel(store, { name: 'general' })
await sendMessage(store, { channelId: channel.id, authorDid, text: 'hello' })
```

```typescript
import { createCallManager, createWebSocketSignaling } from '@xnetjs/comms'

const calls = createCallManager({
  signaling: createWebSocketSignaling({ url: wsUrl }),
  selfDid
})
```

## Testing

```bash
pnpm --filter @xnetjs/comms test
```
