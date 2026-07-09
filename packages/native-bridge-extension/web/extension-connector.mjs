/**
 * Page-side client for the native-messaging bridge (0289, Option C).
 *
 * This is what the xNet web app would import to add an `extension` connector
 * tier alongside `bridge` in `packages/plugins/src/ai/connectors/detect.ts`. It
 * speaks to the extension with `chrome.runtime.sendMessage(<extensionId>, …)`,
 * which only works because the extension allowlisted this origin in
 * `externally_connectable`. `chrome` is injectable so the protocol can be tested
 * without a browser.
 *
 * The contract deliberately mirrors the bridge tier: `probeHealth()` for
 * detection (cheap, unauthenticated), then `chat(messages, model?)` — and the
 * returned object satisfies the same `{ chat }` `ChatAgent` shape the panel's
 * providers consume, so it drops into the ladder as one more available tier.
 */

export const DEFAULT_TIMEOUT_MS = 120_000

/**
 * @param {object} [opts]
 * @param {string}  opts.extensionId  The published/derived extension ID.
 * @param {object} [opts.chrome]      Injectable `chrome` (defaults to global).
 */
export function createExtensionConnector(opts = {}) {
  const chrome = opts.chrome ?? (typeof globalThis !== 'undefined' ? globalThis.chrome : undefined)
  const extensionId = opts.extensionId
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  function send(message) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('xNet bridge extension not installed'))
        return
      }
      const timer = setTimeout(() => reject(new Error('extension timed out')), timeoutMs)
      try {
        chrome.runtime.sendMessage(extensionId, message, (reply) => {
          clearTimeout(timer)
          const lastError = chrome.runtime.lastError
          if (lastError) {
            reject(new Error(lastError.message))
            return
          }
          resolve(reply)
        })
      } catch (err) {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  return {
    /** True when the extension + a working backend answer a health ping. */
    async probeHealth() {
      try {
        const reply = await send({ v: 1, kind: 'health' })
        return reply?.ok === true
      } catch {
        return false
      }
    },
    /** ChatAgent-shaped: return the assistant's reply text, or throw with the reason. */
    async chat(messages, model) {
      const reply = await send({ v: 1, kind: 'chat', messages, ...(model ? { model } : {}) })
      if (!reply?.ok) throw new Error(reply?.error ?? 'bridge extension error')
      return reply.content
    }
  }
}
