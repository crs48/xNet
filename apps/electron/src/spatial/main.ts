import type { SpatialLibraryAdapter, SpatialSnapshot } from '../shared/spatial-library'
import { selectGraph, relationKinds } from '../shared/library-graph/model'
import { graphGroups, graphSearchIndex, searchGraph } from '../shared/library-graph/navigation'
import { projectSpatialSnapshot, validateSpatialSnapshot } from '../shared/spatial-library'
import { pairedAdapter } from './adapter'
import { fixtureAdapter } from './fixtures'
import { createSpatialScene } from './scene'
import './style.css'

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const fail = (error: unknown) => {
  element('error').hidden = false
  element('error').textContent = message(error)
}
let adapter: SpatialLibraryAdapter = fixtureAdapter(1000)
let snapshot: SpatialSnapshot | null = null
let selected: string | null = null
let groups: string[] = [],
  focus: string | null = null
let current = new AbortController(),
  loading = new AbortController()
let generation = 0,
  immersive = false
let thumbnailUrl: string | null = null
let image: ImageBitmap | null = null
let paired = false
let searchIndex: ReturnType<typeof graphSearchIndex> = []
const clearImage = () => {
  if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
  thumbnailUrl = null
  image?.close()
  image = null
  element('thumbnail').hidden = true
}
const scene = (() => {
  try {
    return createSpatialScene(element('canvas'), {
      select(id) {
        void inspect(id)
      },
      status(text) {
        element('status').textContent = text
      },
      session(active) {
        immersive = active
        element('enter').hidden = active
        element('exit').hidden = !active
        element<HTMLButtonElement>('travel').disabled = !active || !selected
        for (const id of ['fixture', 'platform', 'clear', 'neighborhood', 'hand'])
          (element(id) as HTMLButtonElement).disabled = active || (id === 'fixture' && paired)
      }
    })
  } catch (error) {
    fail(`The graph could not start: ${message(error)}`)
    element<HTMLButtonElement>('enter').disabled = true
    throw error
  }
})()
async function inspect(id: string) {
  current.abort()
  current = new AbortController()
  const signal = current.signal
  clearImage()
  selected = id
  element('error').hidden = true
  element('saved-text').hidden = true
  element<HTMLButtonElement>('travel').disabled = !immersive
  element<HTMLButtonElement>('neighborhood').disabled = immersive
  element<HTMLButtonElement>('text').disabled = true
  const index = snapshot?.graph.nodes.findIndex((node) => node.id === id) ?? -1
  const node = snapshot?.graph.nodes[index]
  if (!node || !snapshot) return
  element('title').textContent = node.label
  const edges = snapshot.graph.edges.filter(
    (edge) => edge.source === index || edge.target === index
  )
  const evidence = [...new Set(edges.map((edge) => `${edge.kind} · ${edge.evidence}`))].join('; ')
  element('evidence').textContent = `${edges.length.toLocaleString()} connections. ${evidence}`
  element('coverage').textContent = ''
  if (node.kind !== 'link') {
    element('description').textContent =
      'An imported group of saved links. Use Show neighborhood to explore its members.'
    scene.detail([
      node.label,
      `${edges.length} connections`,
      evidence,
      'Exit / search to filter this neighborhood.'
    ])
    return
  }
  element('description').textContent = 'Reading saved details…'
  try {
    const detail = await adapter.detail(id, signal)
    if (signal.aborted) return
    if (!detail)
      throw new Error(
        'This resource is no longer available. Its graph selection has been retained.'
      )
    const coverage = Object.entries(detail.coverage)
      .map(
        ([field, value]) => `${field}: ${value.state}${value.reason ? ` (${value.reason})` : ''}`
      )
      .join(' · ')
    const transcript = detail.transcript
      ? `${detail.transcript.cues.toLocaleString()} ${detail.transcript.language} transcript cues · ${detail.transcript.source}`
      : 'No spoken transcript saved. Written descriptions are not transcripts.'
    element('title').textContent = detail.title
    element('description').textContent = detail.description || 'No saved description.'
    element('coverage').textContent = `${coverage}\n${transcript}`
    element<HTMLButtonElement>('text').disabled = false
    const lines = [
      detail.title,
      `${detail.platform} · ${detail.author}`,
      detail.description.slice(0, 260) || 'Description unavailable',
      evidence,
      transcript,
      coverage.slice(0, 180)
    ]
    scene.detail(lines)
    if (detail.thumbnail) {
      const blob = await adapter.thumbnail(id, signal)
      if (signal.aborted) return
      if (!blob) {
        element('coverage').textContent += ' Thumbnail unavailable.'
        return
      }
      const decoded = await createImageBitmap(blob)
      if (signal.aborted) {
        decoded.close()
        return
      }
      image = decoded
      thumbnailUrl = URL.createObjectURL(blob)
      element<HTMLImageElement>('thumbnail').src = thumbnailUrl
      element('thumbnail').hidden = false
      scene.detail(lines, decoded)
    }
  } catch (error) {
    if (!signal.aborted) {
      fail(error)
      element('description').textContent = 'Saved details unavailable.'
      scene.detail([node.label, 'Saved details unavailable.', message(error)])
    }
  }
}
function results() {
  if (!snapshot) return
  const found = searchGraph(searchIndex, element<HTMLInputElement>('search').value, 30)
  element('matches').textContent =
    `${found.total.toLocaleString()} matches across all paired links and groups`
  element('results').replaceChildren(
    ...found.items.map(({ node, count }) => {
      const button = document.createElement('button')
      button.textContent = node.label
      const small = document.createElement('small')
      small.textContent = `${node.platform || node.kind} · ${count} connections`
      button.append(small)
      button.onclick = () => {
        if (!snapshot) return
        if (groups.length || focus || element<HTMLSelectElement>('platform').value) {
          groups = []
          focus = null
          element<HTMLSelectElement>('platform').value = ''
          apply()
        }
        scene.select(node.id)
      }
      return button
    })
  )
}
function groupList() {
  if (!snapshot) return
  const query = element<HTMLInputElement>('group-search').value.toLocaleLowerCase()
  const found = graphGroups(snapshot.graph, element<HTMLSelectElement>('platform').value).filter(
    ({ node }) => node.label.toLocaleLowerCase().includes(query)
  )
  element('groups').replaceChildren(
    ...found.slice(0, 40).map(({ node, count }) => {
      const button = document.createElement('button')
      button.textContent = `${node.label} · ${count} links`
      button.setAttribute('aria-pressed', String(groups.includes(node.id)))
      button.onclick = () => {
        if (immersive) return
        groups = groups.includes(node.id)
          ? groups.filter((id) => id !== node.id)
          : [...groups, node.id]
        focus = null
        apply()
      }
      return button
    })
  )
  element('filters').textContent =
    `${groups.length} selected groups (match any). ${found.length.toLocaleString()} groups; showing up to 40. Refine to find any group.`
}
function apply() {
  if (!snapshot || immersive) return
  const graph = selectGraph(
    snapshot.graph,
    element<HTMLSelectElement>('platform').value,
    relationKinds,
    focus,
    groups
  )
  scene.setSnapshot(projectSpatialSnapshot(snapshot, graph))
  element('counts').textContent =
    `${graph.linkCount.toLocaleString()} / ${snapshot.graph.linkCount.toLocaleString()} links · ${graph.edges.length.toLocaleString()} relationships`
  element('status').textContent =
    `Stable snapshot · ${Math.min(graph.edges.length, 20_000).toLocaleString()} relationship lines shown. All links remain searchable.`
  groupList()
}
async function load() {
  loading.abort()
  loading = new AbortController()
  current.abort()
  const signal = loading.signal
  const version = ++generation
  try {
    const value = validateSpatialSnapshot(await adapter.snapshot(signal))
    if (signal.aborted || version !== generation) return
    snapshot = value
    searchIndex = graphSearchIndex(value.graph)
    groups = []
    focus = null
    const select = element<HTMLSelectElement>('platform')
    select.replaceChildren()
    for (const platform of [
      '',
      ...new Set(
        value.graph.nodes.filter((node) => node.kind === 'link').map((node) => node.platform)
      )
    ]) {
      const option = document.createElement('option')
      option.value = platform
      option.textContent = platform || 'All platforms'
      select.append(option)
    }
    apply()
    results()
  } catch (error) {
    if (!signal.aborted) fail(error)
  }
}
element<HTMLInputElement>('search').oninput = results
element<HTMLInputElement>('group-search').oninput = groupList
element<HTMLSelectElement>('platform').onchange = () => {
  focus = null
  apply()
}
element<HTMLSelectElement>('fixture').onchange = async () => {
  if (paired || immersive) return
  adapter.close()
  adapter = fixtureAdapter(Number(element<HTMLSelectElement>('fixture').value))
  selected = null
  await load()
}
element('clear').onclick = () => {
  groups = []
  focus = null
  element<HTMLSelectElement>('platform').value = ''
  apply()
}
element('neighborhood').onclick = () => {
  if (!immersive) {
    focus = selected
    apply()
  }
}
element('home').onclick = scene.home
element('back').onclick = scene.back
element('travel').onclick = scene.destination
element('brake').onclick = scene.brake
element<HTMLSelectElement>('hand').onchange = () =>
  scene.setHand(element<HTMLSelectElement>('hand').value === 'left' ? 'left' : 'right')
element('enter').onclick = () => {
  element<HTMLButtonElement>('enter').disabled = true
  void scene
    .enter()
    .catch(fail)
    .finally(() => {
      element<HTMLButtonElement>('enter').disabled = false
    })
}
element('exit').onclick = () => {
  void scene.exit().catch(fail)
}
element('text').onclick = async () => {
  if (!selected) return
  scene.brake()
  const id = selected,
    signal = current.signal
  try {
    const detail = await adapter.detail(id, signal, true)
    if (!signal.aborted && id === selected) {
      element('saved-text').textContent =
        detail?.text || 'No saved text available. Local audio transcription is not connected.'
      element('saved-text').hidden = false
    }
  } catch (error) {
    if (!signal.aborted) fail(error)
  }
}
element('report').onclick = () => {
  const report = {
    recordedAt: new Date().toISOString(),
    deviceVersions: element<HTMLTextAreaElement>('versions').value,
    ...scene.report()
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'xnet-spatial-probe.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const invitation = new URLSearchParams(location.hash.slice(1)).get('pair')
if (invitation) {
  history.replaceState(null, '', location.pathname)
  try {
    adapter.close()
    adapter = await pairedAdapter(invitation)
    paired = true
    element<HTMLSelectElement>('fixture').disabled = true
    element<HTMLSelectElement>('fixture').options[0].textContent = 'Paired Library · read only'
    element('connection').textContent =
      'Private connection to your Mac. This snapshot expires within one hour; revoke it on the Mac at any time.'
  } catch (error) {
    fail(error)
    element('connection').textContent = 'Pairing failed. Synthetic data is shown.'
  }
}
await load()
try {
  const supported =
    isSecureContext && !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))
  element<HTMLButtonElement>('enter').disabled = !supported
  element('enter').textContent = supported
    ? 'Enter stationary overview'
    : 'Immersive view unavailable'
  element('support').textContent = supported
    ? 'WebXR session support detected. Controller tracking is tested inside the session.'
    : 'Use a supported headset browser over trusted HTTPS. Desktop search and inspection remain available.'
} catch (error) {
  fail(error)
}
window.addEventListener(
  'pagehide',
  () => {
    current.abort()
    loading.abort()
    adapter.close()
    clearImage()
    void scene.dispose().catch(fail)
  },
  { once: true }
)
