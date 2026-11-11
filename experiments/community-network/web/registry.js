const content = document.querySelector('#content')
const status = document.querySelector('#status')
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
function openDesktop() {
  const a = document.createElement('a')
  a.href = 'xnet-community://open/#' + encodeURIComponent(location.href)
  a.textContent = 'Open in xNet'
  a.className = 'open-app'
  return a
}
async function load() {
  const privateFile = /^\/private\/[a-f0-9]{64}$/.test(location.pathname)
  if (location.hash.startsWith('#invite=') || privateFile) {
    document.querySelector('main h1').textContent = privateFile
      ? 'A private file'
      : 'A private invitation'
    document.querySelector('.intro').textContent = privateFile
      ? 'Open this link in xNet with a device that belongs to the private room.'
      : 'Paste this link into Open a link in xNet on your desktop. The room owner checks your invitation.'
    document.querySelector('#search').hidden = true
    const copy = document.createElement('button')
    copy.textContent = 'Copy link'
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(location.href)
        status.textContent = 'Link copied.'
      } catch {
        status.textContent = 'Copy the link from your address bar.'
      }
    }
    content.replaceChildren(openDesktop(), copy)
    return
  }
  status.textContent = 'Finding what this community is sharing…'
  try {
    const match = location.pathname.match(/^\/(watch|room|post)\/([a-f0-9]{64})$/)
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
        const kind = {
          room: 'Conversation',
          image: 'Image',
          video: 'Film',
          audio: 'Music',
          post: 'Public post'
        }[r.kind]
        const route = r.kind === 'room' ? 'room' : r.kind === 'post' ? 'post' : 'watch'
        const media = ['image', 'video', 'audio'].includes(r.kind)
        const parent = /^[a-f0-9]{64}$/.test(r.reply_to || '')
          ? `<a href="/post/${r.reply_to}">In reply to another post</a>`
          : ''
        return `<article><div class="placeholder">${kind}</div><div class="card"><p class="eyebrow">${escape(r.owner_name)} · ${r.kind === 'post' ? 'Public' : `${providers.length} announced hosts`}</p>${r.kind === 'post' ? '' : `<h2>${escape(r.title)}</h2>`}${parent}<p class="body">${escape(r.description)}</p>${match ? `<p class="notice">${r.kind === 'post' ? 'Open this link in the desktop app to reply. Public text is stored in the registry.' : 'Open this link in the desktop app, or use the paired Chrome extension for media playback.'}</p>${media ? `<details><summary>Seeding devices (${providers.length})</summary><ul>${providers.map((p) => `<li><code>${escape(p.id)}</code></li>`).join('')}</ul></details><button data-xnet-watch="${r.id}">${r.kind === 'audio' ? 'Listen' : 'View'} through my desktop</button>` : ''}<label>Shareable link<input readonly value="${escape(location.href)}"></label><div id="player"></div>` : `<a href="/${route}/${r.id}">Open ${kind.toLowerCase()} →</a>`}</div></article>`
      })
      .join('')
    if (match && items.length) content.querySelector('.notice').after(openDesktop())
    status.textContent = `${items.length} ${match ? 'public item' : 'results · newest first'}. Announcements expire; a listed host may be offline.`
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
