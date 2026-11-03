// This development extension is deliberately scoped to the local demo registry.
if (location.origin === 'http://127.0.0.1:4380') {
  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-xnet-watch]') : null
    const id = button?.getAttribute('data-xnet-watch')
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return
    const container = document.getElementById('player')
    if (!container) return
    const frame = document.createElement('iframe')
    frame.src = chrome.runtime.getURL(`player.html#${id}`)
    frame.title = 'xNet desktop peer player'
    container.replaceChildren(frame)
  })
}
