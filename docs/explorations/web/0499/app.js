// All state and fixture interactions stay in this page; no service calls are made.
const $ = (id) => document.getElementById(id)
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  )
let state = initialState()
let feedback = ''
let returnTo = null
const notes = [
  [
    'Public origin or mirror',
    'No account. No peer upload.',
    'The original link remains the destination through sign-in and installation.'
  ],
  [
    'Identity provider + account service',
    'Login only. No imports or room keys.',
    'A canceled callback preserves the destination and draft. Provider linking needs proof on both sides.'
  ],
  [
    'Public records or encrypted room',
    'Each action names its audience.',
    'Social login alone does not decrypt a conversation. Verifying a full client is broader than album-only access.'
  ],
  [
    'The same content reference',
    'Native session and device verification',
    'An install cannot be assumed to transfer cookies or keys. Keep the original link copyable.'
  ],
  [
    'Approved copies on this device',
    'Explicit, revocable hosting consent',
    'Power, network, storage and traffic limits win. Pausing optional hosting preserves ordinary viewing.'
  ],
  [
    'Draft → origin → backup → publication',
    'Audience first; private keys stay local',
    'A storage receipt, a publish receipt and an index receipt are separate. Failed work stays a draft.'
  ],
  [
    'Local, community or wider public index',
    'Remote search discloses a query',
    'Coverage is partial. Private content stays in the authorized device path; wider indexes get public content only.'
  ],
  [
    'Portable data + replaceable services',
    'Control over each service separately',
    'Canceling search does not delete local data. Stopping a host cannot conjure a replacement copy.'
  ]
]

const checked = (value) => (value ? ' checked' : '')
const disabled = (value) => (value ? ' disabled' : '')
const chosen = (value) =>
  value ? ' class="selected" aria-pressed="true"' : ' aria-pressed="false"'
const statusBox = (text, kind = '') => `<div class="status ${kind}">${escapeHtml(text)}</div>`
const heading = (title, text) =>
  `<div class="kicker">Step ${state.step + 1} of 8 · simulated experience</div><h2 id="stage-title" tabindex="-1">${title}</h2><p>${text}</p>`
const check = (id, label, value) =>
  `<label class="check-row"><input id="${id}" type="checkbox"${checked(value)}>${label}</label>`
const action = (id, text, primary = false, unavailable = false) =>
  `<button data-action="${id}"${primary ? ' class="primary"' : ''}${disabled(unavailable)}>${text}</button>`

function sceneContent() {
  const permission = access(state)
  const privateRoom = state.entry === 'private'
  if (state.step === 0)
    return (
      heading(
        'A friend sent you a link.',
        'The content should come first. Compare a public link with a private invitation.'
      ) +
      `<label class="form-row" for="entry">The link opens<select id="entry"><option value="public"${state.entry === 'public' ? ' selected' : ''}>A public garden film</option><option value="private"${state.entry === 'private' ? ' selected' : ''}>A private group invitation</option></select></label>` +
      (permission.allowed
        ? `<div class="card"><div class="poster"><small>Illustrative artwork · no playable video</small><i class="sprout"></i><i class="sprout"></i><i class="sprout"></i></div><div class="card-body"><span class="post-meta">MAYA · ${state.entry === 'public' ? 'PUBLIC POST' : 'PERMITTED PRIVATE ITEM'}</span><h3>A garden after the rain</h3><p>A little film from this weekend. Come help us decide what to plant next.</p><span class="chip">HTTPS playback available in the proposed app</span></div></div>`
        : `<div class="locked"><h3>${state.entry === 'private' ? 'You have a private invitation' : 'Viewing blocked by this policy'}</h3><p>${escapeHtml(permission.reason)}</p></div>`) +
      (permission.allowed ? statusBox('Viewing never enables hosting on its own.', 'good') : '') +
      `<div class="actions">${action('identity', 'Explore joining', true)}${action('install', 'Explore native apps')}</div>`
    )

  if (state.step === 1)
    return (
      heading(
        'Bring an identity you already use.',
        'Your original link stays with you. These buttons simulate provider choices; no credentials are requested.'
      ) +
      `<div class="choice-grid">${['Bluesky', 'Google', 'X / Twitter', 'Email + password'].map((p) => `<button data-provider="${p}"${chosen(state.provider === p)}>${p}</button>`).join('')}</div>` +
      statusBox(
        state.account
          ? `Maya’s demo account is connected through ${state.provider}. Private device access is ${state.verified ? 'verified' : 'still separate'}.`
          : `${state.provider} would authenticate you. Imports, posting to that provider, and private room keys are separate permissions.`,
        state.account ? 'good' : ''
      ) +
      check(
        'provider-down',
        'Simulate this identity provider being unavailable',
        state.providerDown
      ) +
      `<div class="actions">${action('signin', state.account ? 'Reconnect demo account' : 'Continue as Maya (simulation)', true)}</div><p class="notice">Production first: Bluesky plus a provider-independent account method. Google and X appear only when their adapters are configured and tested.</p>`
    )

  if (state.step === 2)
    return (
      heading(
        'Make a small connection.',
        privateRoom
          ? 'React and reply inside the invited group. This example assumes a valid invitation; device verification alone does not create membership.'
          : 'Save privately, follow a creator, or leave a thoughtful public comment. A like does not enable hosting.'
      ) +
      `<div class="actions"><button data-action="like"${chosen(state.liked)}>♡ ${privateRoom ? (state.liked ? 'Reacted in group' : 'React in group') : state.liked ? 'Liked publicly' : 'Like publicly'}</button><button data-action="follow"${chosen(state.followed)}>${privateRoom ? (state.followed ? 'Group updates on' : 'Follow group updates') : state.followed ? 'Following Maya' : 'Follow Maya'}</button><button data-action="save"${chosen(state.saved)}>${state.saved ? 'Saved privately' : 'Save privately'}</button></div>` +
      `<label class="form-row" for="comment">${privateRoom ? 'Reply to this private group' : 'Public comment'}<textarea id="comment" placeholder="I love this little garden…">${escapeHtml(state.comment)}</textarea></label><div class="actions">${action('comment', privateRoom ? 'Send demo reply to this group' : 'Post demo comment publicly', true)}</div>` +
      (state.comments.length
        ? `<ul class="plain-list">${state.comments
            .filter((c) => c.audience === state.entry)
            .map(
              (c) =>
                `<li><strong>You · ${c.audience === 'private' ? 'demo private reply' : 'demo public comment'}</strong><br>${escapeHtml(c.text)}</li>`
            )
            .join('')}</ul>`
        : '<p class="draft-note">Comments appear only in this local example.</p>') +
      `<div class="card"><div class="card-body"><h3>Private group conversation</h3><p>${state.verified ? 'This simulated verified device can show the group’s permitted history.' : 'Your social login has not unlocked encrypted history.'}</p>${action('verify', state.verified ? 'Device verified in this example' : 'Simulate verifying this device', false, state.verified)}</div></div><p class="notice">This represents enrolling a full messaging client. An album-only extension would need a separately enforced, narrower grant.</p>`
    )

  if (state.step === 3)
    return (
      heading(
        'A native app, for a reason.',
        'Keep a collection offline, return to your groups, use a local agent, or help host. Stay on the web if that is enough.'
      ) +
      `<div class="choice-grid">${['desktop', 'phone', 'web'].map((d) => `<button data-device="${d}"${chosen(state.device === d)}>${d === 'desktop' ? 'Try desktop path' : d === 'phone' ? 'Try phone path' : 'Stay on the web'}</button>`).join('')}</div>` +
      `<code class="link-box">https://garden.example/${state.entry === 'public' ? 'p/first-film' : 'invite/example'}</code><p class="draft-note">Example domain. This is the same destination, not a live invitation or installer.</p>` +
      statusBox(
        state.device === 'desktop'
          ? 'Desktop: persistent local storage and optional hosting. Laptop power and network limits still apply.'
          : state.device === 'phone'
            ? 'Phone: camera, viewing, uploads and messages first. Permanent background seeding is not promised.'
            : 'Web: reading and participating remain available. No installation is required under the recommended policy.'
      ) +
      `<p class="notice">Real handoff: install from a trusted distribution channel, reopen the original link, authenticate the app, and separately verify encrypted access. Nothing is installed by this prototype.</p>`
    )

  if (state.step === 4)
    return (
      heading(
        'Help keep this place available.',
        'Choose what this device can contribute. Network and battery protection apply before any transfer.'
      ) +
      check('consent', 'Opt into hosting selected community content (simulation)', state.consent) +
      `<label class="form-row" for="capacity">Storage limit: <strong id="capacity-value">${state.capacity} GB</strong><input id="capacity" type="range" min="0" max="40" step="5" value="${state.capacity}"></label><label class="form-row" for="traffic">Monthly upload budget: <strong id="traffic-value">${state.traffic} GB</strong><input id="traffic" type="range" min="0" max="40" step="5" value="${state.traffic}"></label>` +
      `<small>Illustrative ceiling: 1 Mb/s upload. No actual traffic occurs.</small>` +
      check('charging', 'Connected to power', state.charging) +
      check('unmetered', 'Approved, unmetered network', state.unmetered) +
      (state.device === 'phone'
        ? check('foreground', 'Phone app is in the foreground', state.foreground)
        : '') +
      check('paused', 'Pause hosting', state.paused) +
      `<div id="hosting-result"></div><p class="notice">Public copies and approved private ciphertext have separate scopes. Storing encrypted bytes does not grant the keys. Direct peers may learn network addresses.</p>`
    )

  if (state.step === 5) {
    const flow =
      state.audience === 'public'
        ? ['draft', 'prepared', 'stored', 'published', 'indexed']
        : ['draft', 'prepared', 'stored', 'published', 'delivered']
    const labels = {
      draft: 'Draft',
      prepared: state.audience === 'private' ? 'Encrypted' : 'Prepared',
      stored: 'Stored',
      published: 'Published',
      indexed: 'Searchable',
      delivered: 'Room receipt'
    }
    const next = {
      draft: 'Prepare sample film',
      prepared: 'Simulate origin storage',
      stored: 'Publish sample with retention receipt',
      published:
        state.audience === 'public'
          ? 'Simulate public index receipt'
          : 'Simulate encrypted room receipt'
    }
    return (
      heading(
        'Make something. Choose its audience.',
        'Follow a sample film through preparation, storage and publication. Each receipt means something different.'
      ) +
      `<label class="form-row" for="audience">Audience<select id="audience"><option value="public"${state.audience === 'public' ? ' selected' : ''}>Public post</option><option value="private"${state.audience === 'private' ? ' selected' : ''}>Encrypted group attachment</option></select></label><ol class="step-list">${flow.map((p, i) => `<li class="${i <= flow.indexOf(state.upload) ? 'done' : ''}">${labels[p]}</li>`).join('')}</ol>` +
      check('origin', 'Origin is reachable', state.origin) +
      check('backup', 'Required retention / backup is confirmed', state.backup) +
      statusBox(
        `Current state: ${labels[state.upload] ?? state.upload}. ${state.upload === 'published' ? 'Wider discovery or delivery still needs its own receipt.' : state.audience === 'private' ? 'Preparation and encryption happen on the authorized device; never in the public index.' : 'New content gets a baseline retention budget before popularity matters.'}`
      ) +
      `<div class="actions">${action('upload', next[state.upload] ?? 'Sample journey complete', true, !next[state.upload])}${action('newdraft', 'Start a new sample')}</div><p class="notice">An offline origin can delay storage; a missing backup blocks durable publication. The draft stays available. This prototype transfers no file.</p>`
    )
  }

  if (state.step === 6)
    return (
      heading(
        'Know where you are looking.',
        'Search your device, chosen communities, or a wider public provider. Every result below is an example.'
      ) +
      `<label class="form-row" for="scope">Search scope<select id="scope"><option value="local"${state.scope === 'local' ? ' selected' : ''}>On this device</option><option value="community"${state.scope === 'community' ? ' selected' : ''}>My communities</option><option value="wider"${state.scope === 'wider' ? ' selected' : ''}>Wider public network</option></select></label><label class="form-row" for="query">Search the sample catalog<input id="query" type="text" value="${escapeHtml(state.query)}" placeholder="Try garden or bicycle"></label><label class="form-row" for="ranking">Order<select id="ranking"><option value="newest"${state.ranking === 'newest' ? ' selected' : ''}>Newest first</option><option value="discover"${state.ranking === 'discover' ? ' selected' : ''}>Discover · include new creators</option></select></label>` +
      (state.scope === 'wider'
        ? `<label class="form-row" for="funding">This provider is funded by<select id="funding"><option value="donations"${state.funding === 'donations' ? ' selected' : ''}>Community donations</option><option value="paid"${state.funding === 'paid' ? ' selected' : ''}>Optional search subscription</option><option value="selfhost"${state.funding === 'selfhost' ? ' selected' : ''}>Our own hosted index</option></select></label>${state.funding === 'paid' ? check('plan', 'Simulate an active search subscription · no payment', state.plan) : ''}`
        : '') +
      (state.scope !== 'local'
        ? check('index-online', 'Selected public index is online', state.indexOnline)
        : '') +
      `<div class="actions">${action('search', state.scope === 'local' ? 'Search this device (demo)' : 'Send public query to selected index (demo)', true)}</div><p class="draft-note">${state.scope === 'local' ? 'This scope works offline over the data already indexed here.' : 'In the proposed app, this explicit action sends the query to the selected public provider. Private records are searched only on the authorized device.'} No queries leave this prototype.</p><div id="results"></div>`
    )

  return (
    heading(
      'Your choices should keep working.',
      'Pause hosting, cancel a search service, or switch devices without losing your account or your work.'
    ) +
    `<div class="actions">${action('pause-exit', 'Simulate pausing hosting')}${action('cancel-plan', 'Simulate canceling paid search')}</div>` +
    statusBox(
      `Viewing under this policy: ${access(state).allowed ? 'available' : 'blocked'}. Local search: available over indexed, permitted data. Wider paid search: ${state.plan ? 'enabled' : 'not subscribed'}.`,
      access(state).allowed ? 'good' : 'warn'
    ) +
    `<ul class="plain-list"><li><strong>Keep your data.</strong><br>Exports include records and available attachments; encrypted recovery is a separate tested procedure.</li><li><strong>Keep a way in.</strong><br>Link another login method and set up key recovery. A provider login cannot reconstruct lost keys.</li><li><strong>Choose another index.</strong><br>Direct links and your local corpus do not belong to the paid search provider.</li></ul><div class="actions">${action('local-search', 'Try local search after leaving', true)}</div><p class="notice">If the only content copy is offline, a different index cannot restore its bytes. Withdrawal must be allowed without hiding that consequence.</p>`
  )
}

function updateNotes() {
  const current = notes[state.step]
  $('notes').innerHTML =
    `<h3>Behind this moment</h3><dl><div><dt>Where it lives</dt><dd>${current[0]}</dd></div><div><dt>The permission boundary</dt><dd>${current[1]}</dd></div><div><dt>When it goes wrong</dt><dd>${current[2]}</dd></div></dl><div class="status"><strong>${state.account ? 'Demo account connected' : 'Guest visitor'}</strong>${state.verified ? 'Private device access verified' : 'Private device access not verified'}<br>${state.policy === 'open' ? 'Optional hosting policy' : 'Strict seeding comparison'}</div>`
}

function renderHosting() {
  if (!$('hosting-result')) return
  const result = hosting(state)
  $('capacity-value').textContent = `${state.capacity} GB`
  $('traffic-value').textContent = `${state.traffic} GB`
  $('hosting-result').innerHTML =
    statusBox(result.reason, result.active ? 'good' : '') +
    statusBox(
      `Viewing access: ${access(state).allowed ? 'available' : 'blocked by the selected policy or private-access requirement'}.`,
      access(state).allowed ? 'good' : 'warn'
    )
}

function renderResults() {
  if (!$('results')) return
  const result = search(state)
  $('results').innerHTML =
    statusBox(result.note, result.status === 'ready' ? '' : 'warn') +
    (result.status === 'ready'
      ? `<p class="draft-note">${result.results.length} matching example${result.results.length === 1 ? '' : 's'} · fixture snapshot, not live network coverage</p>` +
        result.results
          .map(
            (r) =>
              `<div class="result"><span class="chip">${r.visibility === 'private' ? 'Private · this device only' : 'Public'}</span><h3>${r.title}</h3><p>${r.author} · ${r.text}</p><p class="why">Why shown: ${state.ranking === 'newest' ? 'Matches this scope and query; sorted by sample date' : r.reason}.</p></div>`
          )
          .join('')
      : '')
}

function render(focus = false) {
  $('device').value = state.device
  $('policy').value = state.policy
  $('steps').innerHTML = stages
    .map(
      (title, i) =>
        `<button data-step="${i}"${i === state.step ? ' aria-current="step"' : ''}><span>${i + 1}</span>${title}</button>`
    )
    .join('')
  $('scene').innerHTML =
    sceneContent() +
    (feedback ? `<div class="status" role="status">${escapeHtml(feedback)}</div>` : '')
  updateNotes()
  renderHosting()
  if (state.step === 6)
    $('results').innerHTML =
      '<p class="notice">Choose a scope, then run the example search. Changing scope clears the previous results.</p>'
  $('back').disabled = state.step === 0
  $('next').disabled = state.step === stages.length - 1
  $('next').textContent = state.step === stages.length - 1 ? 'Journey complete' : 'Next step →'
  if (focus) $('stage-title').focus()
}

function go(step) {
  state.step = Math.max(0, Math.min(stages.length - 1, step))
  feedback = ''
  render(true)
}
function requireAccount() {
  if (state.account) return true
  returnTo = state.step
  feedback = 'Sign in to participate. This draft and the original link are preserved.'
  state.step = 1
  render(true)
  return false
}

$('steps').addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]')
  if (button) go(Number(button.dataset.step))
})
$('back').addEventListener('click', () => go(state.step - 1))
$('next').addEventListener('click', () => go(state.step + 1))
$('reset').addEventListener('click', () => {
  state = initialState()
  feedback = ''
  returnTo = null
  render(true)
})
for (const id of ['device', 'policy'])
  $(id).addEventListener('change', () => {
    state[id] = $(id).value
    feedback = ''
    render()
  })

$('scene').addEventListener('input', (event) => {
  if (event.target.id === 'comment') state.comment = event.target.value
  if (event.target.id === 'query') state.query = event.target.value
  if (['capacity', 'traffic'].includes(event.target.id)) {
    state[event.target.id] = Number(event.target.value)
    renderHosting()
  }
})
$('scene').addEventListener('change', (event) => {
  const mapping = {
    entry: 'entry',
    'provider-down': 'providerDown',
    consent: 'consent',
    charging: 'charging',
    unmetered: 'unmetered',
    foreground: 'foreground',
    paused: 'paused',
    audience: 'audience',
    origin: 'origin',
    backup: 'backup',
    scope: 'scope',
    ranking: 'ranking',
    funding: 'funding',
    plan: 'plan',
    'index-online': 'indexOnline'
  }
  const key = mapping[event.target.id]
  if (!key) return
  state[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value
  if (key === 'entry') {
    state.liked = false
    state.followed = false
    state.saved = false
    state.comment = ''
  }
  if (key === 'audience') state.upload = 'draft'
  feedback = ''
  if (['consent', 'charging', 'unmetered', 'foreground', 'paused'].includes(key)) {
    renderHosting()
    updateNotes()
  } else render()
})
$('scene').addEventListener('click', (event) => {
  const provider = event.target.closest('[data-provider]')
  if (provider) {
    state.provider = provider.dataset.provider
    state.account = false
    state.verified = false
    feedback = ''
    render()
    return
  }
  const device = event.target.closest('[data-device]')
  if (device) {
    state.device = device.dataset.device
    feedback = 'Simulated device changed. The same destination and account state are preserved.'
    render()
    return
  }
  const button = event.target.closest('[data-action]')
  if (!button || button.disabled) return
  const id = button.dataset.action
  if (id === 'identity') return go(1)
  if (id === 'install') return go(3)
  if (id === 'search') {
    renderResults()
    $('announcement').textContent = `Example search: ${search(state).status}.`
    return
  }
  if (id === 'local-search') {
    state.scope = 'local'
    go(6)
    renderResults()
    return
  }
  feedback = ''
  if (id === 'signin') {
    if (state.providerDown)
      feedback =
        'That provider is unavailable. Your link and draft are saved. Choose another verified login method or try again.'
    else {
      state.account = true
      if (returnTo !== null) {
        state.step = returnTo
        returnTo = null
      }
      feedback =
        'Demo account connected. No provider login occurred; encrypted device access is still separate.'
    }
  } else if (id === 'verify') {
    if (!requireAccount()) return
    state.verified = true
    feedback =
      'Device verification simulated. This represents access for a full authorized messaging client.'
  } else if (['like', 'follow', 'save', 'comment'].includes(id)) {
    if (!requireAccount()) return
    if (!access(state).allowed) feedback = access(state).reason
    else if (id === 'comment') {
      if (!state.comment.trim()) feedback = 'Write a comment first.'
      else {
        state.comments.push({ text: state.comment.trim(), audience: state.entry })
        state.comment = ''
        feedback =
          'Demo response added locally for the named audience. Nothing was sent to a server.'
      }
    } else {
      const key = { like: 'liked', follow: 'followed', save: 'saved' }[id]
      state[key] = !state[key]
      feedback = 'Local example updated. Hosting settings were not changed.'
    }
  } else if (id === 'upload') {
    const result = advanceUpload(state)
    state = result.state
    feedback = result.blocked ?? `Simulated receipt: ${state.upload}. No file was uploaded.`
  } else if (id === 'newdraft') state.upload = 'draft'
  else if (id === 'pause-exit') {
    state.paused = true
    feedback = 'Hosting is paused. Under the recommended policy, public viewing stays available.'
  } else if (id === 'cancel-plan') {
    state.plan = false
    state.funding = 'paid'
    feedback =
      'Search subscription cancellation simulated. Local data and direct links are unchanged.'
  }
  render()
})

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('download-md').addEventListener('click', () =>
  download(sourceDocument.filename, sourceDocument.source, 'text/markdown')
)
$('download-html').addEventListener('click', () => {
  const portable = document.documentElement.cloneNode(true)
  for (const id of ['scene', 'steps', 'notes', 'announcement'])
    portable.querySelector(`#${id}`).textContent = ''
  download(
    'xnet-from-link-to-community.html',
    '<!doctype html>\n' + portable.outerHTML,
    'text/html'
  )
})
render()
