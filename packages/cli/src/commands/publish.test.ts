/**
 * End-to-end proof for `xnet publish` (exploration 0362).
 *
 * Renders a real Yjs page through `renderPost()`, writes a site with the
 * command's own builder, then serves the directory over plain HTTP with no
 * xNet infrastructure running and fetches it — the Charter BATNA test, as an
 * executable assertion rather than a promise.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, normalize, resolve } from 'node:path'
import { buildStaticSite, renderPost, type SitePost } from '@xnetjs/publish'
import { assertPublication } from './publish.js'
import * as Y from 'yjs'

function pageDoc(paragraphs: string[]): Y.Doc {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment('content-v4')
  const group = new Y.XmlElement('blockGroup')
  fragment.insert(0, [group])
  for (const text of paragraphs) {
    const container = new Y.XmlElement('blockContainer')
    group.insert(group.length, [container])
    const content = new Y.XmlElement('paragraph')
    container.insert(0, [content])
    const inline = new Y.XmlText()
    content.insert(0, [inline])
    inline.insert(0, text)
  }
  return doc
}

const servers: Server[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((done) => {
          s.close(() => done())
        })
    )
  )
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

/** A deliberately dumb static file server — the "any plain static host" stand-in. */
async function serve(root: string): Promise<string> {
  const server = createServer((req, res) => {
    const raw = decodeURIComponent((req.url ?? '/').split('?')[0])
    const rel = raw.endsWith('/') ? `${raw}index.html` : raw
    const target = resolve(root, `.${normalize(rel)}`)
    // Refuse traversal outside the served root.
    if (!target.startsWith(resolve(root))) {
      res.writeHead(403).end()
      return
    }
    const stream = createReadStream(target)
    stream.on('error', () => res.writeHead(404).end('not found'))
    stream.on('open', () => {
      res.writeHead(200, {
        'content-type': target.endsWith('.xml')
          ? 'application/xml'
          : target.endsWith('.txt')
            ? 'text/plain'
            : 'text/html'
      })
      stream.pipe(res)
    })
  })
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no port')
  return `http://127.0.0.1:${address.port}`
}

describe('xnet publish (static)', () => {
  it('renders a Yjs page and serves it from a plain static host', async () => {
    const rendered = renderPost(pageDoc(['First paragraph.', 'Second paragraph.']))
    expect(rendered.html).toContain('<p>First paragraph.</p>')

    const posts: SitePost[] = [
      {
        slug: 'hello-world',
        title: 'Hello World',
        description: rendered.excerpt,
        publishedAt: '2026-07-01T00:00:00Z',
        authors: ['crs48'],
        html: rendered.html
      },
      {
        slug: 'still-writing',
        title: 'Still Writing',
        description: 'A draft.',
        html: '<p>Unpublished</p>'
      }
    ]

    const site = buildStaticSite({
      meta: {
        siteUrl: 'https://example.test',
        basePath: '/blog',
        title: 'Test Publication',
        description: 'A test.'
      },
      posts
    })

    const dir = await mkdtemp(join(tmpdir(), 'xnet-publish-'))
    dirs.push(dir)
    for (const [path, contents] of site) {
      const target = join(dir, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents, 'utf8')
    }

    const base = await serve(dir)

    // The published post is readable by an anonymous reader with no hub,
    // no runtime, and no JavaScript.
    const page = await fetch(`${base}/hello-world/`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('<p>First paragraph.</p>')
    expect(html).toContain('Hello World')
    expect(html).toContain('crs48')

    // The draft is not on disk and not reachable.
    expect((await fetch(`${base}/still-writing/`)).status).toBe(404)

    const feed = await fetch(`${base}/rss.xml`)
    expect(feed.status).toBe(200)
    const xml = await feed.text()
    expect(xml).toContain('<title>Hello World</title>')
    expect(xml).not.toContain('Still Writing')

    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
    expect(sitemap).toContain('https://example.test/blog/hello-world')
    expect(sitemap).not.toContain('still-writing')

    expect(await (await fetch(`${base}/robots.txt`)).text()).toContain('Sitemap:')

    // Nothing in the output reaches back to xNet infrastructure.
    expect(html).not.toContain('xnet://')
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/)
  })
})

describe('assertPublication', () => {
  const valid = {
    meta: { siteUrl: 'https://x.test', title: 'T', description: '' },
    posts: [{ slug: 'a', title: 'A', description: '', html: '<p>x</p>' }]
  }

  it('accepts a well-formed file', () => {
    expect(() => assertPublication(valid)).not.toThrow()
  })

  it('rejects a non-object', () => {
    expect(() => assertPublication('nope')).toThrow(/JSON object/)
    expect(() => assertPublication(null)).toThrow(/JSON object/)
  })

  it('requires meta.siteUrl and meta.title', () => {
    expect(() => assertPublication({ ...valid, meta: { title: 'T' } })).toThrow(/meta\.siteUrl/)
  })

  it('requires a posts array', () => {
    expect(() => assertPublication({ meta: valid.meta })).toThrow(/posts/)
  })

  it('names the offending index when a post is malformed', () => {
    expect(() =>
      assertPublication({ ...valid, posts: [valid.posts[0], { slug: '', title: 'B', html: '' }] })
    ).toThrow(/posts\[1\]/)
  })

  it('demands rendered html and points at renderPost', () => {
    expect(() => assertPublication({ ...valid, posts: [{ slug: 'a', title: 'A' }] })).toThrow(
      /renderPost/
    )
  })
})
