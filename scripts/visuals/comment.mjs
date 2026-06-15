#!/usr/bin/env node
/**
 * Render the sticky PR comment body from a diff (or capture) manifest.
 *
 *   node scripts/visuals/comment.mjs \
 *     --diff-manifest tmp/visuals/diff-manifest.json \
 *     --base-url https://xnet.fyi/pr/123/visuals \
 *     --run-url https://github.com/owner/repo/actions/runs/42 > body.md
 *
 * The marker keeps the comment a single, upserted entry (same pattern as
 * deploy-pr-preview.yml). buildBody is pure for unit testing.
 */
import { readFileSync } from 'node:fs'

export const MARKER = '<!-- xnet-visuals -->'

const img = (alt, url) => `![${alt}](${url})`

function still(entry, baseUrl) {
  const after = `${baseUrl}/${entry.after ?? entry.file}`
  const title = entry.title ? `${entry.title} — ${entry.name}` : entry.label || entry.id
  if (entry.status === 'new') {
    return `<details open><summary><strong>🆕 ${title}</strong></summary>\n\n${img(title, after)}\n\n</details>`
  }
  // changed: before | after | diff
  const before = entry.before ? `${baseUrl}/${entry.before}` : ''
  const diff = entry.diff ? `${baseUrl}/${entry.diff}` : ''
  const pct = typeof entry.ssim === 'number' ? ` _(SSIM ${entry.ssim.toFixed(3)})_` : ''
  return [
    `<details open><summary><strong>✏️ ${title}</strong>${pct}</summary>`,
    '',
    '| before | after | diff |',
    '| --- | --- | --- |',
    `| ${img('before', before)} | ${img('after', after)} | ${img('diff', diff)} |`,
    '',
    '</details>'
  ].join('\n')
}

function flow(entry, baseUrl) {
  const gif = `${baseUrl}/${entry.gif}`
  const mp4 = `${baseUrl}/${entry.mp4}`
  return [
    `<details open><summary><strong>🎬 ${entry.label || entry.id}</strong></summary>`,
    '',
    img(entry.label || entry.id, gif),
    '',
    `[▶ Watch MP4](${mp4})`,
    '',
    '</details>'
  ].join('\n')
}

export function buildBody(manifest, { baseUrl, runUrl } = {}) {
  const stories = manifest.stories ?? []
  const routes = manifest.routes ?? []
  const flows = manifest.flows ?? []

  const changedStills = [...stories, ...routes].filter(
    (e) => e.status === 'changed' || e.status === 'new'
  )
  const total = changedStills.length + flows.length

  const out = [MARKER, '## 🖼️ UI changes in this PR', '']

  if (total === 0) {
    out.push('_No visual differences detected in the changed UI._')
    if (runUrl) out.push('', `<sub>[CI run](${runUrl})</sub>`)
    return out.join('\n')
  }

  const sections = [
    ['Components', stories.filter((e) => e.status === 'changed' || e.status === 'new')],
    ['Screens', routes.filter((e) => e.status === 'changed' || e.status === 'new')]
  ]
  for (const [heading, items] of sections) {
    if (!items.length) continue
    out.push(`### ${heading}`, '')
    for (const item of items) out.push(still(item, baseUrl), '')
  }
  if (flows.length) {
    out.push('### Interactions', '')
    for (const f of flows) out.push(flow(f, baseUrl), '')
  }

  out.push(
    '',
    `<sub>Auto-captured by CI${runUrl ? ` · [run](${runUrl})` : ''}. Informational — not a blocking check.</sub>`
  )
  return out.join('\n')
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
  }
  const manifest = JSON.parse(
    readFileSync(arg('diff-manifest', 'tmp/visuals/diff-manifest.json'), 'utf8')
  )
  process.stdout.write(
    buildBody(manifest, { baseUrl: arg('base-url', ''), runUrl: arg('run-url', '') })
  )
}
