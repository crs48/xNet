import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../../..')
const filename = '0499_[_]_FROM_SHARED_LINK_TO_COMMUNITY_HOST.md'
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
  if (href === 'web/0499/index.html') ts[i].attrSet('href', '#journey')
  else if (href && !/^(https?:|#)/.test(href)) {
    ts[i].attrSet('title', `Repository reference: ${href}`)
    ts[i].attrSet('class', 'local-reference')
    ts[i].attrs = ts[i].attrs.filter(([key]) => key !== 'href')
  }
  return originalLink(ts, i, options, env, self)
}
const diagrams = [
  '<ol class="sequence"><li>Open the original public link or private invitation.</li><li>Install if useful; keep a copy of the link.</li><li>Authenticate the native session, then verify private-data access separately.</li><li>Return to the same destination before offering optional hosting.</li></ol>',
  '<div class="pipeline"><span>Draft</span><span>Prepare</span><span>Store</span><span>Confirm retention</span><span>Publish</span></div><p>Public → indexing receipt · Private → encrypted delivery receipt</p><p>Offline, quota, and retention failures preserve the draft.</p>',
  '<div class="diagram-row"><span>On-device permitted index</span><span>Chosen community catalogs</span><span>Selected wider public providers</span></div><p>Search scope chooses the route. Results include coverage and freshness.</p><p>Private decrypted content stays in the authorized device path.</p>'
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
const html = template
  .replace('<!-- NAV -->', nav)
  .replace('<!-- CONTENT -->', content)
  .replace('/* MODEL */', model)
  .replace('/* APP */', await readFile(path.join(directory, 'app.js'), 'utf8'))
  .replace('/* SOURCE */', `const sourceDocument = ${embedded};`)
await writeFile(path.join(directory, 'index.html'), html)
console.log(
  `Rendered ${headings.length} chapters, ${diagramIndex} diagrams, and the journey prototype.`
)
