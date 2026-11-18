const destination = document.querySelector('#destination')
const description = document.querySelector('#description')
const status = document.querySelector('#status')
const actions = document.querySelector('#actions')
const open = document.querySelector('#open')
const copy = document.querySelector('#copy')
let currentInvitation
let expiryTimer

function renderInvitation() {
  clearTimeout(expiryTimer)
  currentInvitation = undefined
  actions.hidden = true
  open.removeAttribute('href')
  status.textContent = ''
  try {
    const payload = location.hash.slice(1)
    if (location.search || !payload || payload.length > 11900 || !/^[A-Za-z0-9_-]+$/.test(payload))
      throw new Error('This invitation is incomplete. Ask your friend to send the full link.')
    let invitation
    try {
      const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
        char.charCodeAt(0)
      )
      invitation = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new Error('This invitation could not be read. Ask your friend for a new link.')
    }
    if (
      ![1, 2].includes(invitation?.version) ||
      typeof invitation.name !== 'string' ||
      !invitation.name.trim() ||
      invitation.name.length > 80 ||
      !Number.isSafeInteger(invitation.expires)
    )
      throw new Error('This invitation could not be read. Ask your friend for a new link.')
    if (invitation.expires <= Date.now())
      throw new Error('This invitation has expired. Ask your friend for a fresh link.')
    // This is a preview; the desktop app checks the signature and capability before connecting.
    destination.textContent = invitation.name
    description.textContent =
      'Open xNet to review the invitation and choose how you’d like to introduce yourself.'
    currentInvitation = { payload, expires: invitation.expires }
    open.href = `xnet://peer#${payload}`
    actions.hidden = false
    expiryTimer = setTimeout(
      renderInvitation,
      Math.min(invitation.expires - Date.now(), 2147483647)
    )
  } catch (cause) {
    destination.textContent = 'Let’s get you a new invitation'
    status.textContent =
      cause instanceof Error ? cause.message : 'This invitation could not be read.'
    description.textContent = 'Your profile and existing conversations are unaffected.'
  }
}
open.addEventListener('click', (event) => {
  if (!currentInvitation || currentInvitation.expires <= Date.now()) {
    event.preventDefault()
    renderInvitation()
    return
  }
  status.textContent =
    'Your browser may ask to open xNet. If nothing happens, install the app or copy the invitation below.'
})
copy.addEventListener('click', async () => {
  if (!currentInvitation || currentInvitation.expires <= Date.now()) {
    renderInvitation()
    return
  }
  const invitation = currentInvitation
  try {
    await navigator.clipboard.writeText(`https://xnet.fyi/join#${invitation.payload}`)
    if (currentInvitation === invitation)
      status.textContent = 'Invitation copied. Paste it into xNet.'
  } catch {
    if (currentInvitation === invitation)
      status.textContent =
        'Clipboard access was denied. Copy the full link from your address bar instead.'
  }
})
window.addEventListener('hashchange', renderInvitation)
renderInvitation()
