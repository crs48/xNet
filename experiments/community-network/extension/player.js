import { playbackResponse } from './protocol.js'

const status = document.getElementById('status')
const retry = document.getElementById('retry')
const video = document.getElementById('video')
const image = document.getElementById('image')
const audio = document.getElementById('audio')
const id = location.hash.slice(1)
let attempt = 0
let pending = false

function connect() {
  if (pending) return
  const current = ++attempt
  pending = true
  retry.hidden = true
  status.textContent = 'Connecting to your desktop…'
  video.pause()
  audio.pause()
  for (const media of [video, image, audio]) {
    media.onerror = null
    media.hidden = true
    media.removeAttribute('src')
  }
  video.load()
  audio.load()

  const fail = (message) => {
    if (attempt !== current) return
    pending = false
    status.textContent = message
    retry.hidden = false
  }
  const timeout = setTimeout(() => {
    fail('Your desktop did not respond. Open xNet, check that hosting is on, then try again.')
    // Ignore a late response; only a new click can start another attempt.
    attempt++
  }, 30000)
  chrome.runtime.sendMessage({ op: 'play', id }, (response) => {
    const error = chrome.runtime.lastError
    if (attempt !== current) return
    clearTimeout(timeout)
    if (error) {
      fail(
        'Desktop bridge unavailable. Open xNet and check the browser connection, then try again.'
      )
      return
    }
    try {
      const session = playbackResponse(response, id)
      const media = session.kind === 'image' ? image : session.kind === 'audio' ? audio : video
      pending = false
      media.hidden = false
      media.onerror = () =>
        fail('Playback stopped. Check desktop hosting and peer availability, then try again.')
      media.src = session.url
      if (session.kind === 'image') image.alt = session.title
      status.textContent = `${session.title} · through your desktop peer`
    } catch (error) {
      fail(error.message)
    }
  })
}

retry.addEventListener('click', connect)
if (!/^[a-f0-9]{64}$/.test(id)) {
  status.textContent = 'Invalid content link.'
} else {
  connect()
}
