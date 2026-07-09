/**
 * The relay: turn one decoded native message into one response (0289, Option C).
 *
 * Kept transport-free and backend-injected so it can be unit-tested without a
 * browser, a subprocess, or a socket. `xnet-bridge-host.mjs` wires stdin →
 * decoder → {@link handleMessage} → encoder → stdout around it; the extension's
 * service worker speaks the same `{ v, kind }` envelope to the page.
 */

export const PROTOCOL_VERSION = 1

/**
 * Handle one request envelope against a backend, returning a response envelope.
 * Never throws — a backend failure becomes `{ ok: false, error }` so the host
 * can always frame a reply and the page composer surfaces the reason instead of
 * hanging. Each reply echoes the request `id` (if any) so the page can correlate
 * concurrent turns over a single long-lived port.
 */
export async function handleMessage(msg, backend) {
  const id = msg && typeof msg === 'object' ? msg.id : undefined
  const reply = (body) => (id === undefined ? body : { ...body, id })
  try {
    if (!msg || typeof msg !== 'object') {
      return reply({ ok: false, error: 'malformed message' })
    }
    if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
      return reply({ ok: false, error: `unsupported protocol version ${msg.v}` })
    }
    switch (msg.kind) {
      case 'health':
        return reply({ ok: true, ...(await backend.health()) })
      case 'chat': {
        const messages = Array.isArray(msg.messages) ? msg.messages : []
        if (messages.length === 0) return reply({ ok: false, error: 'no messages' })
        const content = await backend.chat(messages, typeof msg.model === 'string' ? msg.model : undefined)
        return reply({ ok: true, content })
      }
      default:
        return reply({ ok: false, error: `unknown kind: ${String(msg.kind)}` })
    }
  } catch (err) {
    return reply({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
