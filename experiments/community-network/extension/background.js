import { playbackRequest } from './protocol.js'

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let request
  try {
    request = playbackRequest(
      message,
      sender,
      chrome.runtime.id,
      chrome.runtime.getURL('player.html')
    )
  } catch (error) {
    reply({ ok: false, error: error.message })
    return false
  }
  chrome.runtime.sendNativeMessage('fyi.xnet.community', request, (response) => {
    const error = chrome.runtime.lastError
    reply(error ? { ok: false, error: `Desktop bridge unavailable: ${error.message}` } : response)
  })
  return true
})
