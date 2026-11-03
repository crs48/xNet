chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const player = chrome.runtime.getURL('player.html')
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(`${player}#`) ||
    message.op !== 'play' ||
    !/^[a-f0-9]{64}$/.test(message.id)
  ) {
    reply({ ok: false, error: 'Playback request rejected.' })
    return false
  }
  const page = sender.tab?.url ? new URL(sender.tab.url) : null
  if (
    !page ||
    page.origin !== 'http://127.0.0.1:4380' ||
    page.pathname !== `/watch/${message.id}`
  ) {
    reply({ ok: false, error: 'Open this video on the paired registry first.' })
    return false
  }
  chrome.runtime.sendNativeMessage(
    'fyi.xnet.community',
    { op: 'play', id: message.id },
    (response) => {
      const error = chrome.runtime.lastError
      reply(error ? { ok: false, error: `Desktop bridge unavailable: ${error.message}` } : response)
    }
  )
  return true
})
