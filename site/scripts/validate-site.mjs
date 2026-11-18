import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const site = fileURLToPath(new URL('..', import.meta.url))
const baseline = JSON.parse(readFileSync(join(site, 'src/data/legacy-blog.json'), 'utf8'))
const redirects = JSON.parse(readFileSync(join(site, 'src/data/legacy-docs.json'), 'utf8'))
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(join(dir, entry.name)) : [join(dir, entry.name)])
}
const pages = files(join(site, 'src/pages')).filter((p) => p.endsWith('.astro') && !p.includes('['))
  .map((p) => relative(join(site, 'src/pages'), p).replace(/\.astro$/u, '').replace(/(^|\/)index$/u, ''))
const required = [...new Set([...pages, ...baseline.pages, ...redirects.map((r) => r.route)])]
  .map((route) => route.replace(/\/$/u, '')).map((route) => route ? `${route}/index.html` : 'index.html')
required.push('blog/rss.xml', 'wordmark.svg', 'favicon.svg')
function errorsFor({ paths, hashes }) {
  return [
    ...required.filter((p) => !paths.has(p)).map((p) => `Missing built route: ${p}`),
    ...['renderers.mjs', 'chunks', 'pages'].filter((p) => paths.has(p)).map((p) => `Unfinished Astro artifact: ${p}`),
    ...Object.entries(baseline.images).filter(([p, hash]) => hashes.get(p) !== hash).map(([p]) => `Historical blog artwork changed or missing: ${p}`)
  ]
}
// Consumer: every site build, before the deleting production rsync.
if (process.argv.includes('--selftest')) {
  const valid = { paths: new Set(required), hashes: new Map(Object.entries(baseline.images)) }
  assert.deepEqual(errorsFor(valid), [])
  for (const path of ['index.html', 'download/index.html', baseline.pages[0] + '/index.html']) {
    const paths = new Set(valid.paths); paths.delete(path)
    assert.ok(errorsFor({ ...valid, paths }).length > 0)
  }
  assert.ok(errorsFor({ ...valid, hashes: new Map() }).length > 0)
  assert.ok(errorsFor({ ...valid, paths: new Set([...valid.paths, 'renderers.mjs']) }).length > 0)
  console.log('Site negative controls passed (in memory).')
} else {
  const dist = join(site, 'dist')
  if (!existsSync(dist)) throw new Error('No site build output')
  const output = files(dist)
  const paths = new Set([...output.map((p) => relative(dist, p)), ...readdirSync(dist)])
  const hashes = new Map(Object.keys(baseline.images).filter((p) => existsSync(join(dist, p)))
    .map((p) => [p, createHash('sha256').update(readFileSync(join(dist, p))).digest('hex')]))
  const errors = errorsFor({ paths, hashes })
  const nav = readFileSync(join(site, 'src/components/sections/Nav.astro'), 'utf8')
  if (nav.includes("label: 'Docs'") || nav.includes("label: 'Developers'")) errors.push('Retired developer navigation is still advertised')
  for (const p of baseline.pages) {
    const path = join(dist, p, 'index.html')
    if (existsSync(path) && !readFileSync(path, 'utf8').includes('From the workspace era')) errors.push(`No era notice on ${p}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Verified ${required.length} routes/assets and preserved ${baseline.pages.length} essays with ${hashes.size} original artworks.`)
}
