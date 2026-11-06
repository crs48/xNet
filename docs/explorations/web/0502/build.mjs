import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../../..')
const filename = '0502_[_]_FROM_ATTENTION_TO_SHARED_AGENCY.md'
const source = await readFile(path.resolve(directory, '../..', filename), 'utf8')
const dependencies = await readdir(path.join(root, 'node_modules/.pnpm'))
const dependency = dependencies.find((name) => name.startsWith('markdown-it@14.'))
if (!dependency) throw new Error('Repository markdown-it dependency is required.')
const { default: MarkdownIt } = await import(
  pathToFileURL(
    path.join(root, 'node_modules/.pnpm', dependency, 'node_modules/markdown-it/index.mjs')
  )
)
const md = new MarkdownIt({ html: true })
const tokens = md.parse(source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^# .+\n/m, ''), {})
const headings = []
const ids = new Set()
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type !== 'heading_open') continue
  const label = tokens[i + 1].content
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (ids.has(id)) throw new Error(`Duplicate heading: ${id}`)
  ids.add(id)
  tokens[i].attrSet('id', id)
  if (tokens[i].tag === 'h2') headings.push({ label, id })
}
const defaultLink =
  md.renderer.rules.link_open ?? ((ts, i, options, env, self) => self.renderToken(ts, i, options))
md.renderer.rules.link_open = (ts, i, options, env, self) => {
  const href = ts[i].attrGet('href')
  if (href === 'web/0502/index.html') ts[i].attrSet('href', '#top')
  else if (href && !/^(https?:|#)/.test(href)) {
    ts[i].attrSet('title', `Repository reference: ${href}`)
    ts[i].attrSet('class', 'local-reference')
    ts[i].attrs = ts[i].attrs.filter(([key]) => key !== 'href')
  }
  return defaultLink(ts, i, options, env, self)
}
const images = Object.fromEntries(
  await Promise.all(
    ['shared-table', 'gift-shelf'].map(async (key) => [
      key,
      `data:image/png;base64,${(await readFile(path.join(directory, 'assets', `${key}.png`))).toString('base64')}`
    ])
  )
)
const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (ts, i, options, env, self) => {
  const src = ts[i].attrGet('src')
  if (src === 'web/0502/assets/gift-shelf.png') ts[i].attrSet('src', images['gift-shelf'])
  else throw new Error(`Unresolved portable image: ${src}`)
  ts[i].attrSet('loading', 'lazy')
  ts[i].attrSet('width', '1536')
  ts[i].attrSet('height', '1024')
  return defaultImage(ts, i, options, env, self)
}
const diagrams = [
  '<figcaption>Two surfaces. One cycle of learning.</figcaption><ol class="flow"><li>Social home</li><li>Shared inquiry</li><li>Evidence & perspectives</li><li>Reviewed map</li><li>Proposal</li><li>Voluntary commitments</li><li>Outcome & review</li></ol><p>The brief returns to the community. Missing perspectives and objections can send the inquiry back for more work.</p>',
  '<figcaption>A brief travels. Consent does not.</figcaption><ol class="flow"><li>Private discussion</li><li>Participant review</li><li>Publishable brief</li><li>Another community adapts</li><li>Recheck local context</li><li>New decision</li><li>Share lessons upstream</li></ol>',
  '<figcaption>AI proposes. People review.</figcaption><ol class="flow"><li>Share selected material</li><li>AI drafts with sources</li><li>People edit, reject or approve</li><li>Confirm version & audience</li><li>Publish reviewed content</li></ol><p>No generated votes, implied consent, or automatic commitments.</p>'
]
let diagramIndex = 0
const fence = md.renderer.rules.fence
md.renderer.rules.fence = (ts, i, options, env, self) => {
  if (ts[i].info.trim() !== 'mermaid') return fence(ts, i, options, env, self)
  const diagram = diagrams[diagramIndex++]
  if (!diagram) throw new Error('Missing diagram rendering')
  return `<figure class="diagram">${diagram}<details><summary>View Mermaid source</summary><pre>${md.utils.escapeHtml(ts[i].content)}</pre></details></figure>`
}
let content = md.renderer.render(tokens, md.options, {})
if (diagramIndex !== diagrams.length) throw new Error('Diagram count mismatch')
content = content
  .replace(/<li>\[ \] /g, '<li class="task"><span aria-label="Proposed, not implemented">□</span> ')
  .replace(/<p>\[!(TIP|NOTE|IMPORTANT|WARNING)\]\n/g, '<p>')
  .replace(
    /<table>/g,
    '<div class="table-wrap" tabindex="0" role="region" aria-label="Comparison table"><table>'
  )
  .replace(/<\/table>/g, '</table></div>')
const nav = headings
  .map(
    ({ id, label }, index) =>
      `<a href="#${id}"><span>${String(index + 1).padStart(2, '0')}</span>${md.utils.escapeHtml(label.replace(/^\d+\. /, ''))}</a>`
  )
  .join('\n')
const wordmark = (await readFile(path.join(root, 'site/public/wordmark.svg'), 'utf8'))
  .replace(/<\?xml[^>]*>/, '')
  .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
const embedded = JSON.stringify({ filename, source }).replace(/</g, '\\u003c')
const template = await readFile(path.join(directory, 'template.html'), 'utf8')
const html = template
  .replace('<!-- WORDMARK -->', wordmark)
  .replace('<!-- NAV -->', nav)
  .replace('<!-- CONTENT -->', content)
  .replace('HERO_IMAGE', images['shared-table'])
  .replace('/* SOURCE */', `const sourceDocument = ${embedded};`)
await writeFile(
  path.join(directory, 'index.html'),
  await format(html, {
    ...(await resolveConfig(path.join(directory, 'index.html'))),
    parser: 'html'
  })
)
console.log(
  `Rendered ${headings.length} chapters, ${diagramIndex} diagrams and ${Object.keys(images).length} embedded illustrations.`
)
