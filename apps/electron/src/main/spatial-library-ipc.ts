import type { LibraryGraph, LibraryGraphDetail } from '../shared/library-graph'
import type { SpatialDetail } from '../shared/spatial-library'
import type { Server } from 'node:https'
import { X509Certificate, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join, resolve } from 'node:path'
import { app, clipboard, dialog, ipcMain } from 'electron'
import { createSpatialSnapshot } from '../shared/spatial-library'
import { sendDataProcessRequest } from './data-process-manager'
import { createSpatialBridge } from './spatial-bridge'
import { createSpatialServer } from './spatial-server'

let server: Server | null = null
let revoke: (() => void) | null = null
let expiry: ReturnType<typeof setTimeout> | null = null
let starting = false
let generation = 0
let pairing: { url: string; expiresAt: number; count: number } | null = null
export async function stopSpatialLibrary(): Promise<void> {
  generation++
  revoke?.()
  revoke = null
  pairing = null
  if (expiry) clearTimeout(expiry)
  expiry = null
  const old = server
  server = null
  if (old) {
    old.closeAllConnections()
    await new Promise<void>((done) => old.close(() => done()))
  }
}
async function resource(id: string) {
  const response = (await sendDataProcessRequest('library:graph-detail', { id }, 120_000)) as {
    value: LibraryGraphDetail
  }
  const item = response.value.resource
  return item && !item.kind && /^https?:\/\//.test(item.url) ? item : null
}
export function setupSpatialLibraryIPC() {
  ipcMain.handle('xnet:spatial:status', () =>
    pairing ? { ...pairing, url: new URL(pairing.url).origin } : null
  )
  ipcMain.handle('xnet:spatial:stop', stopSpatialLibrary)
  ipcMain.handle('xnet:spatial:copy', () => {
    if (!pairing) throw new Error('Create a pairing first.')
    clipboard.writeText(pairing.url)
  })
  ipcMain.handle('xnet:spatial:start', async (_event, input: { origin: string; ids: string[] }) => {
    if (starting || server) throw new Error('Revoke the current pairing before creating another.')
    if (
      !input ||
      typeof input.origin !== 'string' ||
      !Array.isArray(input.ids) ||
      input.ids.length < 1 ||
      input.ids.length > 100_000 ||
      !input.ids.every((id) => typeof id === 'string' && id.length <= 500)
    )
      throw new Error('Choose saved links to share with the viewer.')
    const url = new URL(input.origin)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !url.port ||
      Number(url.port) < 1024
    )
      throw new Error('Use your Mac’s trusted HTTPS address with a port above 1023.')
    starting = true
    const attempt = generation
    try {
      const certChoice = await dialog.showOpenDialog({
        title: 'Choose the trusted HTTPS certificate for this Mac',
        properties: ['openFile'],
        filters: [{ name: 'Certificate', extensions: ['pem', 'crt'] }]
      })
      if (certChoice.canceled) throw new Error('Pairing canceled.')
      const keyChoice = await dialog.showOpenDialog({
        title: 'Choose its private TLS key (kept on this Mac)',
        properties: ['openFile'],
        filters: [{ name: 'Private key', extensions: ['pem', 'key'] }]
      })
      if (keyChoice.canceled) throw new Error('Pairing canceled.')
      const cert = await readFile(certChoice.filePaths[0]),
        key = await readFile(keyChoice.filePaths[0])
      const certificate = new X509Certificate(cert)
      const hostname = url.hostname.replace(/^\[|\]$/g, '')
      if (
        !(isIP(hostname) ? certificate.checkIP(hostname) : certificate.checkHost(hostname)) ||
        Date.parse(certificate.validTo) < Date.now() ||
        Date.parse(certificate.validFrom) > Date.now()
      )
        throw new Error(
          'The certificate is expired, not yet valid, or does not cover this address.'
        )
      // Serve only compiled browser assets. Never proxy the renderer dev server or debugger.
      const directory = resolve(app.getAppPath(), 'out/spatial')
      const assets = new Map<string, { data: Buffer; type: string }>()
      const readAssets = async (dir: string, prefix: string) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const path = `${prefix}/${entry.name}`
          if (entry.isDirectory()) await readAssets(join(dir, entry.name), path)
          else if (/\.(html|js|css)$/.test(entry.name))
            assets.set(path, {
              data: await readFile(join(dir, entry.name)),
              type: entry.name.endsWith('.js')
                ? 'text/javascript'
                : entry.name.endsWith('.css')
                  ? 'text/css'
                  : 'text/html'
            })
        }
      }
      await readAssets(directory, '')
      if (!assets.has('/index.html'))
        throw new Error('The spatial viewer is missing from this app build.')
      const response = (await sendDataProcessRequest('library:graph', {}, 600_000)) as {
        value: string
      }
      const graph = JSON.parse(response.value) as LibraryGraph
      const chosen = new Set(input.ids)
      const scope = new Set(
        graph.nodes.flatMap((node, i) => (node.kind === 'link' && chosen.has(node.id) ? [i] : []))
      )
      const edges = graph.edges.filter((edge) => scope.has(edge.source))
      edges.forEach((edge) => scope.add(edge.target))
      const remap = new Map<number, number>()
      const nodes = graph.nodes.filter((_node, i) => {
        if (!scope.has(i)) return false
        remap.set(i, remap.size)
        return true
      })
      const scoped = {
        ...graph,
        nodes,
        edges: edges.map((edge) => ({
          ...edge,
          source: remap.get(edge.source)!,
          target: remap.get(edge.target)!
        })),
        linkCount: nodes.filter((node) => node.kind === 'link').length,
        resourceCount: nodes.filter((node) => node.kind === 'link').length,
        warnings: []
      }
      if (!scoped.linkCount) throw new Error('The selected saved links are no longer available.')
      const bridge = createSpatialBridge(
        {
          snapshot: createSpatialSnapshot(scoped, randomUUID()),
          async detail(id, text): Promise<SpatialDetail | null> {
            const item = await resource(id)
            if (!item) return null
            return {
              id,
              title: item.metadata?.title || item.title,
              description: (item.metadata?.description ?? '').slice(0, 8000),
              platform: item.platform,
              author: item.metadata?.author ?? item.actor,
              coverage: item.metadata?.fields ?? {},
              transcript: item.transcript
                ? {
                    source: item.transcript.source,
                    language: item.transcript.language,
                    cues: item.transcript.cues.length
                  }
                : null,
              thumbnail: !!item.thumbnail,
              ...(text
                ? {
                    text: (
                      item.transcript?.cues.map((cue) => cue.text).join('\n') ?? item.sourceText
                    ).slice(0, 100_000)
                  }
                : {})
            }
          },
          async thumbnail(id) {
            const item = await resource(id)
            if (!item?.thumbnail || item.thumbnail.bytes > 8 * 1024 * 1024) return null
            const blob = (await sendDataProcessRequest(
              'blob:get',
              { cid: item.thumbnail.cid },
              60_000
            )) as { data: number[] | null }
            return blob.data
              ? { data: new Uint8Array(blob.data), contentType: item.thumbnail.contentType }
              : null
          }
        },
        url.origin
      )
      const next = createSpatialServer({ cert, key, origin: url.origin, assets, bridge })
      if (attempt !== generation) {
        bridge.revoke()
        throw new Error('Pairing was canceled.')
      }
      await new Promise<void>((done, reject) => {
        next.once('error', reject)
        next.listen(Number(url.port), '0.0.0.0', () => {
          next.removeListener('error', reject)
          done()
        })
      })
      if (attempt !== generation) {
        bridge.revoke()
        next.closeAllConnections()
        await new Promise<void>((done) => next.close(() => done()))
        throw new Error('Pairing was canceled.')
      }
      server = next
      next.on('error', (error: Error) => {
        console.error('[Spatial Library] HTTPS listener failed:', error.message)
        void stopSpatialLibrary()
      })
      revoke = bridge.revoke
      pairing = {
        url: `${url.origin}/#pair=${bridge.invitation}`,
        expiresAt: bridge.expiresAt,
        count: scoped.linkCount
      }
      expiry = setTimeout(
        () => {
          void stopSpatialLibrary()
        },
        Math.max(0, bridge.expiresAt - Date.now())
      )
      clipboard.writeText(pairing.url)
      return { ...pairing, url: url.origin }
    } finally {
      starting = false
    }
  })
}
