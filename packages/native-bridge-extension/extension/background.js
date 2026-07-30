/**
 * xNet Local Bridge — background service worker (exploration 0289, Option C).
 *
 * The only job: relay a message from the xNet web page to the native-messaging
 * host and hand the reply back. Two allowlists guard the door, and they are the
 * whole security story of this approach:
 *
 *  1. `externally_connectable.matches` in the manifest — only pages whose origin
 *     matches (the deployed PWA + loopback for dev) can even deliver a message to
 *     `onMessageExternal`. We re-check `sender.origin` below as defence in depth.
 *  2. The native host's own manifest pins `allowed_origins` to THIS extension's
 *     ID, so the OS refuses to launch the host for any other extension.
 *
 * There is no `fetch`, no port, no CORS here — the page never touches the network
 * to reach the model. That is what removes the DNS-rebinding / drive-by-site
 * surface that the loopback-HTTP bridge has to defend against with a token.
 */

const NATIVE_HOST = 'fyi.xnet.bridge'

// Belt-and-braces alongside `externally_connectable`: the exact origins allowed
// to drive the local model. Keep in lockstep with the manifest matches.
const ALLOWED_ORIGINS = new Set(['https://xnet.fyi', 'http://localhost', 'http://127.0.0.1'])

function originOf(sender) {
  if (sender.origin) return new URL(sender.origin).origin
  if (sender.url) return new URL(sender.url).origin
  return null
}

function isAllowed(sender) {
  const origin = originOf(sender)
  return origin !== null && ALLOWED_ORIGINS.has(origin)
}

/**
 * Send one framed request to the native host and resolve with its one reply.
 * A fresh short-lived port per request keeps the POC simple; a streaming build
 * would keep the port open and forward `port.onMessage` deltas to the page.
 */
function callNativeHost(message) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      try {
        port.disconnect()
      } catch {
        /* already gone */
      }
      resolve(value)
    }
    const port = chrome.runtime.connectNative(NATIVE_HOST)
    port.onMessage.addListener((reply) => done(reply))
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError
      done({ ok: false, error: err ? err.message : 'native host disconnected' })
    })
    try {
      port.postMessage(message)
    } catch (err) {
      done({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowed(sender)) {
    sendResponse({ ok: false, error: 'origin not allowed' })
    return false
  }
  if (!message || (message.kind !== 'health' && message.kind !== 'chat')) {
    sendResponse({ ok: false, error: 'unknown request' })
    return false
  }
  callNativeHost(message).then(sendResponse)
  return true // keep the channel open for the async reply
})
