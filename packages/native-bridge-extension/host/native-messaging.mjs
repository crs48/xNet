/**
 * Chrome/Firefox native-messaging wire framing (exploration 0289, Option C).
 *
 * A native messaging host speaks a trivial length-prefixed protocol over
 * stdin/stdout: each message is a 4-byte unsigned length (the browser writes it
 * in the machine's *native* byte order — little-endian on every platform Chrome
 * ships) followed by that many bytes of UTF-8 JSON. The browser also caps a
 * single message at 1 MB in each direction.
 *
 * This module is the one source of truth for that framing: the runnable host
 * (`xnet-bridge-host.mjs`) and the tests both import it, so there is no second
 * copy to drift. Pure Node built-ins, zero dependencies — a native host is
 * spawned by the browser as `node <path>`, so it must run without a build step.
 */

/** Browser-enforced ceiling on a single native message (1 MB each way). */
export const MAX_MESSAGE_BYTES = 1024 * 1024

/**
 * Frame a JS value as a native message: 4-byte little-endian length + UTF-8
 * JSON. Throws if the encoded body exceeds {@link MAX_MESSAGE_BYTES} (the
 * browser would silently drop an over-long frame otherwise).
 */
export function encodeMessage(value) {
  const json = Buffer.from(JSON.stringify(value), 'utf8')
  if (json.length > MAX_MESSAGE_BYTES) {
    throw new Error(`native message too large: ${json.length} > ${MAX_MESSAGE_BYTES} bytes`)
  }
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(json.length, 0)
  return Buffer.concat([header, json])
}

/**
 * A stateful decoder for the inbound stdin stream. Feed it raw chunks with
 * {@link push}; it invokes `onMessage(value)` once per complete frame and
 * buffers partial frames across chunk boundaries. `onError` is called (and the
 * decoder stops emitting) if a frame declares a length past the 1 MB cap —
 * treated as a framing desync / hostile peer rather than silently growing an
 * unbounded buffer.
 */
export function createMessageDecoder(onMessage, onError = () => {}) {
  let buffer = Buffer.alloc(0)
  let poisoned = false

  return {
    push(chunk) {
      if (poisoned) return
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      // Drain every complete frame currently in the buffer.
      for (;;) {
        if (buffer.length < 4) return
        const length = buffer.readUInt32LE(0)
        if (length > MAX_MESSAGE_BYTES) {
          poisoned = true
          onError(new Error(`native message length ${length} exceeds ${MAX_MESSAGE_BYTES}`))
          return
        }
        if (buffer.length < 4 + length) return // frame not fully arrived yet
        const body = buffer.subarray(4, 4 + length)
        buffer = buffer.subarray(4 + length)
        let value
        try {
          value = JSON.parse(body.toString('utf8'))
        } catch (err) {
          poisoned = true
          onError(err instanceof Error ? err : new Error(String(err)))
          return
        }
        onMessage(value)
      }
    }
  }
}
