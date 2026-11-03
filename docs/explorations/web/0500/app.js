const controls = document.querySelector('#policy-controls')
const results = document.querySelector('#policy-results')
const reportControls = document.querySelector('#report-controls')
const reportPreview = document.querySelector('#report-preview')
const status = document.querySelector('#report-status')
const submit = document.querySelector('#simulate-report')
const element = (tag, text, className) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}
function renderPolicy() {
  const data = new FormData(controls)
  const decision = evaluatePolicy({
    ...Object.fromEntries(data),
    member: data.has('member'),
    communityRestricted: data.has('communityRestricted'),
    blockContact: data.has('blockContact')
  })
  const sample = element('div', undefined, 'sample')
  sample.append(
    element('span', decision.item.category, 'category'),
    element('h3', decision.item.title),
    element('p', decision.item.text)
  )
  const outcomes = element('dl', undefined, 'outcomes')
  for (const [key, title] of [
    ['display', 'Your view'],
    ['contact', 'Contact'],
    ['community', 'Community'],
    ['index', 'Discovery'],
    ['hosting', 'Your device']
  ]) {
    const outcome = element('div', undefined, 'outcome')
    const details = element('dd')
    details.append(
      element('strong', decision[key].value),
      element('p', decision[key].reason),
      element('span', decision[key].authority, 'authority')
    )
    outcome.append(element('dt', title), details)
    outcomes.append(outcome)
  }
  results.replaceChildren(
    sample,
    outcomes,
    element('p', decision.review, 'receipt'),
    element('p', decision.labelStatus, 'lab-foot')
  )
}
controls.addEventListener('change', renderPolicy)
controls.addEventListener('submit', (event) => event.preventDefault())
// The reset event precedes the browser restoring the controls' default values.
controls.addEventListener('reset', () => setTimeout(renderPolicy, 0))
renderPolicy()

for (const message of fictionalMessages) {
  const label = element('label', undefined, 'message')
  const input = element('input')
  input.type = 'checkbox'
  input.name = 'message'
  input.value = message.id
  input.setAttribute('aria-label', `Include ${message.author} at ${message.time}`)
  if (message.id === 'm2') input.checked = true
  const body = element('span')
  body.append(
    element('strong', message.author),
    element('time', message.time),
    element('p', message.text)
  )
  label.append(input, body)
  document.querySelector('#report-messages').append(label)
}
function readReport() {
  const data = new FormData(reportControls)
  return {
    ids: data.getAll('message'),
    recipient: data.get('recipient'),
    consent: data.has('consent')
  }
}
function renderReport() {
  const state = readReport()
  const preview = previewReport(state.ids, state.recipient)
  const list = element('ul')
  for (const message of preview.messages)
    list.append(element('li', `${message.author} · ${message.time} — ${message.text}`))
  if (!preview.messages.length) list.append(element('li', 'No messages selected.'))
  reportPreview.replaceChildren(
    element('h3', 'Disclosure preview'),
    element('p', `Recipient: ${preview.recipient}`),
    list,
    element('p', preview.disclosure),
    element('p', preview.warning)
  )
  submit.disabled = !state.consent || state.ids.length === 0
}
reportControls.addEventListener('change', (event) => {
  if (event.target.name !== 'consent') reportControls.elements.namedItem('consent').checked = false
  status.textContent = ''
  renderReport()
})
reportControls.addEventListener('submit', (event) => {
  event.preventDefault()
  const state = readReport()
  try {
    status.textContent = simulateReport(state.ids, state.recipient, state.consent).status
  } catch (error) {
    status.textContent = error.message
  }
})
renderReport()

function download(filename, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = element('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
document
  .querySelector('#download-md')
  .addEventListener('click', () =>
    download(sourceDocument.filename, sourceDocument.source, 'text/markdown;charset=utf-8')
  )
document.querySelector('#download-html').addEventListener('click', () => {
  // Reset transient DOM in the export; scripts reconstruct the default simulations.
  const copy = document.documentElement.cloneNode(true)
  for (const id of ['policy-results', 'report-messages', 'report-preview', 'report-status'])
    copy.querySelector(`#${id}`).replaceChildren()
  copy.querySelector('[name=consent]').removeAttribute('checked')
  copy.querySelector('#simulate-report').setAttribute('disabled', '')
  download(
    'xnet-moderation-with-agency.html',
    '<!doctype html>\n' + copy.outerHTML,
    'text/html;charset=utf-8'
  )
})
document.querySelector('#print').addEventListener('click', () => window.print())
const navLinks = [...document.querySelectorAll('.sidebar nav a')]
const observer = new IntersectionObserver(
  (entries) => {
    const active = entries.find((entry) => entry.isIntersecting)
    if (!active) return
    for (const link of navLinks) {
      if (link.hash === '#' + active.target.id) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
  },
  { rootMargin: '-5% 0px -75% 0px' }
)
for (const heading of document.querySelectorAll('section[id], .document h2'))
  observer.observe(heading)
