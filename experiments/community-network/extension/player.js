const status = document.getElementById('status')
const id = location.hash.slice(1)
if (!/^[a-f0-9]{64}$/.test(id)) {
  status.textContent = 'Invalid content link.'
} else {
  chrome.runtime.sendMessage({ op: 'play', id }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      status.textContent =
        response?.error ||
        chrome.runtime.lastError?.message ||
        'Start the desktop app and enable hosting.'
      return
    }
    const { url, item } = response.result
    const parsed = new URL(url)
    if (
      parsed.hostname !== '127.0.0.1' ||
      parsed.protocol !== 'http:' ||
      parsed.pathname !== `/media/${id}`
    ) {
      status.textContent = 'Unexpected playback address.'
      return
    }
    const media = document.getElementById(item.record.payload.kind === 'image' ? 'image' : 'video')
    media.hidden = false
    media.src = url
    media.addEventListener('error', () => {
      status.textContent =
        'Playback stopped. Check desktop hosting, peer availability and codec support.'
    })
    status.textContent = `${item.record.payload.title} · through your desktop peer`
  })
}
