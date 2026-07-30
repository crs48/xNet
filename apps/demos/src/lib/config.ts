/**
 * Demo configuration. Mirrors the web app's hub resolution (apps/web/src/lib/
 * hub-url.ts): unset VITE_HUB_URL in dev means "local hub", production
 * builds default to the public demo hub. The demo hub runs in quota'd demo
 * mode with idle eviction (exploration 0291) — data here is a sandbox, not
 * durable storage.
 */
export const HUB_URL: string =
  import.meta.env.VITE_HUB_URL ??
  (import.meta.env.DEV ? 'ws://localhost:4444' : 'wss://hub.xnet.fyi')

/** One relay room per demo room code, shared by all demos in that room. */
export function nodeSyncRoom(room: string): string {
  return `xnet-demo-${room}`
}
