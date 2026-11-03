const content = document.querySelector('#content')
const status = document.querySelector('#status')
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
async function load() {
  status.textContent = 'Finding what this community is sharing…'
  try {
    const match = location.pathname.match(/^\/(watch|room)\/([a-f0-9]{64})$/)
    const response = await fetch(
      match
        ? `/api/items/${match[2]}`
        : `/api/catalog?q=${encodeURIComponent(document.querySelector('#query').value)}`
    )
    if (!response.ok) throw new Error('The registry could not complete this request.')
    const data = await response.json()
    const items = match ? [data] : data
    content.innerHTML = items
      .map(({ record, providers }) => {
        const r = record.payload
        return `<article><div class="placeholder">${r.kind === 'room' ? 'Conversation' : r.kind === 'image' ? 'Image' : 'Film'}</div><div class="card"><p class="eyebrow">${escape(r.owner_name)} · ${providers.length} announced ${providers.length === 1 ? 'host' : 'hosts'}</p><h2>${escape(r.title)}</h2><p>${escape(r.description)}</p>${match ? `<p class="notice">Open this link in the desktop app, or use the paired Chrome extension to watch here.</p>${r.kind !== 'room' ? `<button data-xnet-watch="${r.id}">Watch through my desktop</button>` : ''}<label>Shareable link<input readonly value="${escape(location.href)}"></label><div id="player"></div>` : `<a href="/${r.kind === 'room' ? 'room' : 'watch'}/${r.id}">Open ${r.kind === 'room' ? 'conversation' : 'post'} →</a>`}</div></article>`
      })
      .join('')
    status.textContent = `${items.length} ${match ? 'public post' : 'results · newest first'}. Announcements expire; a listed host may be offline.`
  } catch (error) {
    status.textContent = error.message
  }
}
document.querySelector('#search').addEventListener('submit', (event) => {
  event.preventDefault()
  load()
})
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-xnet-watch]'))
    status.textContent =
      'If the paired extension is installed, its player opens below. Otherwise, paste this link into the desktop app.'
})
load()
