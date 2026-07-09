import { describe, it, expect } from 'vitest'
import { createExtensionConnector } from '../web/extension-connector.mjs'

/**
 * A fake `chrome.runtime` that routes `sendMessage(extId, msg, cb)` through a
 * handler, mimicking the extension's `onMessageExternal` relay — so we exercise
 * the page-side protocol with no browser.
 */
function fakeChrome(handler) {
  return {
    runtime: {
      lastError: null,
      sendMessage(extensionId, message, cb) {
        Promise.resolve(handler(message, extensionId)).then((reply) => cb(reply))
      }
    }
  }
}

describe('createExtensionConnector', () => {
  it('probeHealth is true when the extension answers ok', async () => {
    const chrome = fakeChrome((msg) =>
      msg.kind === 'health' ? { ok: true, agent: 'claude' } : { ok: false }
    )
    const c = createExtensionConnector({ chrome, extensionId: 'abc' })
    expect(await c.probeHealth()).toBe(true)
  })

  it('probeHealth is false when the extension is absent', async () => {
    const c = createExtensionConnector({ chrome: undefined, extensionId: 'abc' })
    expect(await c.probeHealth()).toBe(false)
  })

  it('chat returns the assistant content', async () => {
    const chrome = fakeChrome((msg) => ({ ok: true, content: `reply:${msg.messages[0].content}` }))
    const c = createExtensionConnector({ chrome, extensionId: 'abc' })
    expect(await c.chat([{ role: 'user', content: 'hi' }])).toBe('reply:hi')
  })

  it('chat rejects with the backend error message', async () => {
    const chrome = fakeChrome(() => ({ ok: false, error: 'origin not allowed' }))
    const c = createExtensionConnector({ chrome, extensionId: 'abc' })
    await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/origin not allowed/)
  })

  it('surfaces chrome.runtime.lastError as a rejection', async () => {
    const chrome = {
      runtime: {
        lastError: { message: 'Could not establish connection' },
        sendMessage(_id, _msg, cb) {
          cb(undefined)
        }
      }
    }
    const c = createExtensionConnector({ chrome, extensionId: 'abc' })
    await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/establish connection/)
  })

  it('sends the v:1 envelope the host expects', async () => {
    let seen
    const chrome = fakeChrome((msg) => {
      seen = msg
      return { ok: true, content: 'x' }
    })
    const c = createExtensionConnector({ chrome, extensionId: 'abc' })
    await c.chat([{ role: 'user', content: 'hi' }], 'claude')
    expect(seen).toEqual({ v: 1, kind: 'chat', messages: [{ role: 'user', content: 'hi' }], model: 'claude' })
  })
})
