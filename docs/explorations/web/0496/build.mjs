import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../../..')
const filename = '0496_[_]_PORTABLE_SOCIAL_FOUNDATIONS.md'
const source = await readFile(path.resolve(directory, '../..', filename), 'utf8')
const dependencies = await readdir(path.join(root, 'node_modules/.pnpm'))
const packageName = dependencies.find((name) => name.startsWith('markdown-it@14.'))
if (!packageName) throw new Error('Install the repository dependencies to render Markdown.')
const { default: MarkdownIt } = await import(
  pathToFileURL(
    path.join(root, 'node_modules/.pnpm', packageName, 'node_modules/markdown-it/index.mjs')
  )
)
const md = new MarkdownIt({ html: true, typographer: false })
const body = source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^# .+\n/m, '')
const tokens = md.parse(body, {})
const headings = []
for (let i = 0; i < tokens.length; i += 1) {
  if (tokens[i].type !== 'heading_open') continue
  const label = tokens[i + 1].content
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  tokens[i].attrSet('id', id)
  if (tokens[i].tag === 'h2') headings.push({ id, label })
}
const linkRule =
  md.renderer.rules.link_open ?? ((ts, i, options, env, self) => self.renderToken(ts, i, options))
md.renderer.rules.link_open = (ts, i, options, env, self) => {
  const href = ts[i].attrGet('href')
  if (href && !/^(https?:|#)/.test(href)) {
    ts[i].attrSet('title', `Local repository reference: ${href}`)
    ts[i].attrSet('class', 'repo-reference')
    ts[i].attrSet('data-local-path', href)
    ts[i].attrs = ts[i].attrs.filter(([key]) => key !== 'href')
  }
  return linkRule(ts, i, options, env, self)
}
const diagrams = [
  `<div class="diagram-stack"><div class="diagram-root">Clients & agent-built views</div><div class="diagram-arrow" aria-hidden="true">↓</div><div class="diagram-root">Typed commands & scoped queries</div><div class="diagram-arrow" aria-hidden="true">↓</div><div class="diagram-columns"><div><b>Local drafts</b><span>SQLite</span></div><div><b>Public records</b><span>AT Protocol</span></div><div><b>Private chat</b><span>Messaging SDK</span></div><div><b>Shared editing</b><span>CRDT documents</span></div></div><p>Public and private paths use media storage with different privacy rules.<br>Every path needs its own export and recovery adapter.</p></div>`,
  `<div class="diagram-pipeline"><span>Select media</span><i aria-hidden="true">→</i><span>Quarantine</span><i aria-hidden="true">→</i><span>Isolated worker</span><i aria-hidden="true">→</i><span>Original + renditions</span></div><div class="diagram-columns two"><div><b>Record path</b><span>Publish → community index → chosen feed → client</span></div><div><b>Media path</b><span>Origin → CDN → client</span></div></div>`,
  `<ol class="message-sequence"><li><b>Sender device</b><span>Save locally, encrypt, and submit with a retry identity.</span></li><li><b>Delivery service</b><span>Accept durably and retain ciphertext while the recipient is offline.</span></li><li><b>Recipient device</b><span>Resume, verify, decrypt, deduplicate, and save.</span></li><li><b>Receipt</b><span>Report delivery when the selected protocol supports it. Reading is a separate state.</span></li></ol>`
]
let diagramIndex = 0
const fence = md.renderer.rules.fence
md.renderer.rules.fence = (ts, i, options, env, self) => {
  if (ts[i].info.trim() !== 'mermaid') return fence(ts, i, options, env, self)
  const diagram = diagrams[diagramIndex++]
  if (!diagram) throw new Error('A new Mermaid diagram needs a reader rendering.')
  return `<figure class="architecture" aria-label="Proposed architecture diagram">${diagram}<details><summary>Mermaid source</summary><pre><code>${md.utils.escapeHtml(ts[i].content)}</code></pre></details></figure>`
}
let article = md.renderer.render(tokens, md.options, {})
article = article.replace(/<p>\[!TIP\]\n/g, '<p><strong>Recommendation</strong><br>')
article = article
  .replace(
    /<table>/g,
    '<div class="table-scroll" tabindex="0" role="region" aria-label="Comparison table"><table>'
  )
  .replace(/<\/table>/g, '</table></div>')
const sections = article.split(/(?=<h2 id=)/).filter(Boolean)
article = sections.map((html) => `<section class="chapter">${html}</section>`).join('\n')
const nav = headings
  .map(
    (h, i) =>
      `<a href="#${h.id}"><span>${String(i + 1).padStart(2, '0')}</span>${md.utils.escapeHtml(h.label)}</a>`
  )
  .join('\n')
const template = await readFile(path.join(directory, 'template.html'), 'utf8')
const embedded = JSON.stringify({ filename, source }).replace(/</g, '\\u003c')
const output = template
  .replace('<!-- CONTENT -->', article)
  .replace('<!-- NAV -->', nav)
  .replace('/* SOURCE */', `const sourceDocument = ${embedded};`)
await writeFile(path.join(directory, 'index.html'), output)
console.log(
  `Rendered ${headings.length} chapters and ${diagramIndex} diagrams → ${path.join(directory, 'index.html')}`
)
