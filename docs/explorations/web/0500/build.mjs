import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../../..')
const filename = '0500_[_]_MODERATION_WITH_AGENCY.md'
const source = await readFile(path.resolve(directory, '../..', filename), 'utf8')
const dependencies = await readdir(path.join(root, 'node_modules/.pnpm'))
const dependency = dependencies.find((name) => name.startsWith('markdown-it@14.'))
if (!dependency) throw new Error('Repository markdown-it dependency is required to build.')
const { default: MarkdownIt } = await import(
  pathToFileURL(
    path.join(root, 'node_modules/.pnpm', dependency, 'node_modules/markdown-it/index.mjs')
  )
)
const md = new MarkdownIt({ html: true })
const tokens = md.parse(source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^# .+\n/m, ''), {})
const headings = []
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type !== 'heading_open') continue
  const label = tokens[i + 1].content
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  tokens[i].attrSet('id', id)
  if (tokens[i].tag === 'h2') headings.push({ label, id })
}
const originalLink =
  md.renderer.rules.link_open ?? ((ts, i, options, env, self) => self.renderToken(ts, i, options))
md.renderer.rules.link_open = (ts, i, options, env, self) => {
  const href = ts[i].attrGet('href')
  if (href === 'web/0500/index.html') ts[i].attrSet('href', '#policy-lab')
  else if (href && !/^(https?:|#)/.test(href)) {
    ts[i].attrSet('title', `Repository reference: ${href}`)
    ts[i].attrSet('class', 'local-reference')
    ts[i].attrs = ts[i].attrs.filter(([key]) => key !== 'href')
  }
  return originalLink(ts, i, options, env, self)
}
const diagrams = [
  '<figcaption>Policy inputs become separate, scoped outcomes.</figcaption><div class="diagram-row"><span>Attributed assertions</span><span>Personal preferences</span><span>Community &amp; operator rules</span></div><div class="diagram-down" aria-hidden="true">↓</div><div class="diagram-row"><span>Scoped policy evaluation</span></div><div class="diagram-down" aria-hidden="true">↓</div><div class="diagram-leaves"><span>Display</span><span>Contact</span><span>Discovery</span><span>Hosting</span><span>Reasons &amp; appeals</span></div>',
  '<figcaption>A private report is an explicit, bounded disclosure.</figcaption><ol><li>Select messages and optional context on your device.</li><li>Preview the exact evidence and recipient.</li><li>Approve this disclosure.</li><li>Send only approved evidence to that reviewer.</li><li>Receive case updates; apply a retention deadline.</li></ol>',
  '<figcaption>One decision path, enforced at every relevant access path.</figcaption><div class="diagram-row"><span>Reports &amp; assertions</span><b aria-hidden="true">→</b><span>Private case queue</span><b aria-hidden="true">→</b><span>Authorized decision</span></div><div class="diagram-down" aria-hidden="true">↓</div><div class="diagram-row"><span>Minimal journal</span><b aria-hidden="true">→</b><span>Materialized policy state</span></div><div class="diagram-down" aria-hidden="true">↓</div><div class="diagram-leaves"><span>Client explanations</span><span>Registry &amp; direct lookup</span><span>Peer admission &amp; chunks</span><span>Bridge tickets &amp; ranges</span></div><p>Appeals and reversals update the journal and recompute the affected views.</p>',
  '<figcaption>A decision is reviewable, including after a temporary restriction.</figcaption><div class="diagram-row"><span>Received</span><b aria-hidden="true">→</b><span>Triage</span><b aria-hidden="true">→</b><span>No action, or review</span></div><p>Temporary restrictions can protect a space while review is pending.</p><div class="diagram-row"><span>Decision &amp; notice</span><b aria-hidden="true">→</b><span>Appeal</span><b aria-hidden="true">→</b><span>Independent review</span></div><p>Outcome: uphold, or reverse → retract the restriction and restore affected access.</p>'
]

let diagramIndex = 0
const fence = md.renderer.rules.fence
md.renderer.rules.fence = (ts, i, options, env, self) => {
  if (ts[i].info.trim() !== 'mermaid') return fence(ts, i, options, env, self)
  const diagram = diagrams[diagramIndex++]
  if (!diagram) throw new Error('Missing diagram rendering')
  return `<figure class="architecture">${diagram}<details><summary>Diagram source</summary><pre>${md.utils.escapeHtml(ts[i].content)}</pre></details></figure>`
}
let content = md.renderer.render(tokens, md.options, {})
if (diagramIndex !== diagrams.length) throw new Error('Diagram count mismatch')
content = content.replace(
  /<li>\[ \] /g,
  '<li class="task-item"><span class="task-box" aria-label="Not implemented">□</span> '
)
content = content.replace(/<p>\[!(TIP|NOTE|IMPORTANT|WARNING)\]\n/g, '<p>')
content = content
  .replace(
    /<table>/g,
    '<div class="table-wrap" tabindex="0" role="region" aria-label="Comparison table"><table>'
  )
  .replace(/<\/table>/g, '</table></div>')
const nav = headings
  .map(({ id, label }) => `<a href="#${id}">${md.utils.escapeHtml(label)}</a>`)
  .join('\n')
const template = await readFile(path.join(directory, 'template.html'), 'utf8')
const model = (await readFile(path.join(directory, 'model.mjs'), 'utf8')).replace(/^export /gm, '')
const embedded = JSON.stringify({ filename, source }).replace(/</g, '\\u003c')
const wordmark = (await readFile(path.join(root, 'site/public/wordmark.svg'), 'utf8'))
  .replace(/<\?xml[^>]*>/, '')
  .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
const html = template
  .replace('<!-- WORDMARK -->', wordmark)
  .replace('<!-- NAV -->', nav)
  .replace('<!-- CONTENT -->', content)
  .replace('/* MODEL */', model)
  .replace('/* APP */', await readFile(path.join(directory, 'app.js'), 'utf8'))
  .replace('/* SOURCE */', `const sourceDocument = ${embedded};`)
const formatted = await format(html, {
  ...(await resolveConfig(path.join(directory, 'index.html'))),
  parser: 'html'
})
await writeFile(path.join(directory, 'index.html'), formatted)
console.log(
  `Rendered ${headings.length} chapters, ${diagramIndex} diagrams, and two local moderation simulations.`
)
