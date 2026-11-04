import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../../..')
const filename = '0501_[_]_COLLECTIVE_SENSEMAKING_AT_COMMUNITY_SCALE.md'
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
const originalLink =
  md.renderer.rules.link_open ?? ((ts, i, options, env, self) => self.renderToken(ts, i, options))
md.renderer.rules.link_open = (ts, i, options, env, self) => {
  const href = ts[i].attrGet('href')
  if (href === 'web/0501/index.html') ts[i].attrSet('href', '#main')
  else if (href && !/^(https?:|#)/.test(href)) {
    ts[i].attrSet('title', `Repository reference: ${href}`)
    ts[i].attrSet('class', 'local-reference')
    ts[i].attrs = ts[i].attrs.filter(([key]) => key !== 'href')
  }
  return originalLink(ts, i, options, env, self)
}
const diagrams = [
  '<figcaption>One question, a process people can follow.</figcaption><ol class="flow"><li>Declare the question and the commitment</li><li>Invite broad participation</li><li>Examine patterns, evidence and disagreement</li><li>Develop proposals with facilitation</li><li>Return for review or an authorized decision</li><li>Publish an outcome and response</li><li>Organize voluntary follow-through</li><li>Review what happened and reopen questions</li></ol><p>Findings can send the group back to participation. No decision is also a valid outcome.</p>',
  '<figcaption>A portable process with an available coordinator.</figcaption><div class="flow-grid"><div><b>Participation</b><p>Browser and Tauri clients → gateway and eligibility checks → durable process service.</p></div><div><b>Analysis</b><p>Authorized inputs → Polis adapter and worker → versioned findings → process service.</p></div><div><b>Public access</b><p>Reviewed reports and outcomes → registry and optional mirrors.</p></div><div><b>Restricted access</b><p>Bounded export → authorized reviewers. Iroh copies stay within their access scope.</p></div></div>',
  '<figcaption>Records preserve the meaning of participation.</figcaption><dl><dt>Question</dt><dd>Contains rounds and proposal versions.</dd><dt>Round</dt><dd>Freezes its process agreement, admits eligible participants and offers statement versions.</dd><dt>Response</dt><dd>Belongs to an eligible participant and an exact statement version.</dd><dt>Analysis artifact</dt><dd>Describes a round at an identified cutoff, using a declared method.</dd><dt>Outcome</dt><dd>Connects a proposal version to an authorized decision and its commitments.</dd></dl>'
]
let diagramIndex = 0
const fence = md.renderer.rules.fence
md.renderer.rules.fence = (ts, i, options, env, self) => {
  if (ts[i].info.trim() !== 'mermaid') return fence(ts, i, options, env, self)
  const diagram = diagrams[diagramIndex++]
  if (!diagram) throw new Error('Missing diagram rendering')
  return `<figure>${diagram}<details><summary>Mermaid source</summary><pre>${md.utils.escapeHtml(ts[i].content)}</pre></details></figure>`
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
  .map(({ id, label }) => `<a href="#${id}">${md.utils.escapeHtml(label)}</a>`)
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
  .replace('/* SOURCE */', `const sourceDocument = ${embedded};`)
await writeFile(
  path.join(directory, 'index.html'),
  await format(html, {
    ...(await resolveConfig(path.join(directory, 'index.html'))),
    parser: 'html'
  })
)
console.log(`Rendered ${headings.length} chapters and ${diagramIndex} accessible diagrams.`)
