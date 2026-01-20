# xNet Signaling Server

WebSocket signaling server for P2P WebRTC connections, compatible with y-webrtc.

## Protocol

The server implements the y-webrtc signaling protocol:

```typescript
// Subscribe to topics (rooms)
{ type: 'subscribe', topics: ['room1', 'room2'] }

// Unsubscribe from topics
{ type: 'unsubscribe', topics: ['room1'] }

// Publish to a topic (broadcast to other subscribers)
{ type: 'publish', topic: 'room1', data: { ... } }

// Ping/pong for keepalive
{ type: 'ping' }
{ type: 'pong' }
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode (with hot reload)
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Start production build
pnpm start
```

The server runs on port 4000 by default (configurable via `PORT` env var).

## Testing P2P Sync

### Using the HTML Demo

1. Start the signaling server:

   ```bash
   pnpm dev
   ```

2. Open the demo page in two browser tabs:

   ```bash
   open test/sync-demo.html
   ```

3. Type in one tab and see changes appear in the other.

### Using the Web App

1. Start the signaling server:

   ```bash
   pnpm dev
   ```

2. Start the web app:

   ```bash
   cd ../../apps/web && pnpm dev
   ```

3. Open two browser tabs to the same document URL (e.g., `/doc/test`).

4. Type in one tab and see changes appear in the other.

## Endpoints

- `ws://localhost:4000/` - WebSocket endpoint
- `http://localhost:4000/health` - Health check (JSON)
- `http://localhost:4000/metrics` - Prometheus metrics

## Deployment

The server is ready to deploy to fly.io:

```bash
fly launch --name xnet-signaling
fly deploy
```

See `fly.toml` for configuration.
