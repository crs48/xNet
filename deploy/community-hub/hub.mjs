import { spawn } from 'node:child_process'
import { createServer, request } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startGateway } from './gateway.mjs'

const env = process.env
function integer(name, fallback, max) {
  const n = Number(env[name] ?? fallback)
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw Error(`Invalid ${name}`)
  return n
}
const mode = env.HUB_MODE ?? 'both'
if (!['both', 'tracker', 'relay'].includes(mode)) throw Error('Invalid HUB_MODE')
const tracker = mode !== 'relay'
const relay = mode !== 'tracker'
const port = integer('PORT', 8080, 65535)
const limit = integer('TRACKER_REQUESTS_PER_MINUTE', 900, 1_000_000)
const directory = env.RELAY_DATA_DIR ?? '/data'
const children = []
let closing = false
let server
function stop(code) {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
  if (server) void server.close()
  setTimeout(() => process.exit(code), 3000).unref()
}
function run(command, args) {
  const process = spawn(command, args, { stdio: 'inherit' })
  children.push(process)
  process.on('error', (e) => {
    console.error(e.message)
    stop(1)
  })
  process.on('exit', () => {
    if (!closing) stop(1)
  })
}
if (tracker) {
  if (relay) {
    env.TRACKER_CHECK_ADMISSION = '1'
    if (!env.TRACKER_RELAY_URL) throw Error('Set TRACKER_RELAY_URL to the public relay origin')
  }
  const moderators = (env.TRACKER_MODERATORS ?? '').split(',').filter(Boolean)
  run('community-registry', [
    '--bind',
    '127.0.0.1:3343',
    '--database',
    join(directory, 'tracker.sqlite'),
    ...moderators.flatMap((id) => ['--moderator', id])
  ])
}
const routes = new Set([
  '/',
  '/join',
  '/style.css',
  '/registry.js',
  '/api/catalog',
  '/api/moderation/policy'
])
const writes = new Set([
  '/api/announce',
  '/api/moderation',
  '/api/private/announce',
  '/api/private/resolve'
])
const maxInflight = integer('TRACKER_MAX_IN_FLIGHT', 32, 4096)
let inflight = 0
let window = -1
let count = 0
function proxy(req, res, path, body) {
  const upstream = request(
    {
      hostname: '127.0.0.1',
      port: 3343,
      method: req.method,
      path,
      headers: req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {},
      timeout: 5000
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
    }
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503)
    res.end()
  })
  upstream.on('timeout', () => upstream.destroy())
  res.on('close', () => upstream.destroy())
  upstream.end(body)
}
async function probe(port, path) {
  return new Promise((resolve) => {
    const check = request({ hostname: '127.0.0.1', port, path, timeout: 1200 }, (response) => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    check.on('timeout', () => check.destroy())
    check.on('error', () => resolve(false))
    check.end()
  })
}
async function readiness(res) {
  const [r, t] = await Promise.all([
    relay && probe(3340, '/healthz'),
    tracker && probe(3343, '/tracker/ready')
  ])
  res.writeHead((!relay || r) && (!tracker || t) ? 200 : 503, {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  })
  res.end(
    JSON.stringify({
      mode,
      relay: relay ? (r ? 'ready' : 'unavailable') : 'disabled',
      tracker: tracker ? (t ? 'ready' : 'unavailable') : 'disabled'
    })
  )
}
function handle(req, res) {
  const path = req.url.split('?')[0]
  if (req.method === 'GET' && path === '/hub/ready') {
    void readiness(res)
    return true
  }
  const read =
    req.method === 'GET' &&
    (routes.has(path) || /^\/(watch|private|room|post|api\/items)\/[a-f0-9]{64}$/.test(path))
  const write = req.method === 'POST' && writes.has(path)
  if (!tracker || (!read && !write)) return false
  const minute = Math.floor(Date.now() / 60000)
  if (window !== minute) {
    window = minute
    count = 0
  }
  if (++count > limit) {
    res.writeHead(429, { 'retry-after': '60' })
    res.end()
    return true
  }
  if (Number(req.headers['content-length'] ?? 0) > 96 * 1024) {
    res.writeHead(413)
    res.end()
    return true
  }
  if (inflight >= maxInflight) {
    res.writeHead(503, { 'retry-after': '1' })
    res.end()
    return true
  }
  if (write && req.headers['content-type']?.split(';')[0].toLowerCase() !== 'application/json') {
    res.writeHead(415)
    res.end()
    return true
  }
  inflight++
  res.once('close', () => {
    inflight--
  })
  if (write) {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= 96 * 1024) chunks.push(chunk)
      else if (!res.writableEnded) {
        chunks.length = 0
        res.writeHead(413, { connection: 'close' })
        res.end()
      }
    })
    req.on('end', () => {
      if (!res.destroyed && !res.writableEnded) proxy(req, res, req.url, Buffer.concat(chunks))
    })
  } else {
    proxy(req, res, req.url)
  }
  return true
}
if (relay) {
  server = await startGateway({
    directory,
    port,
    handleHttp: handle,
    bootstrap: (env.BOOTSTRAP_ENDPOINTS ?? '').split(',').filter(Boolean),
    revoked: (env.REVOKED_ENDPOINTS ?? '').split(',').filter(Boolean),
    dailyBytes: integer('DAILY_RELAY_BYTES', 67108864, 2 ** 30),
    maxConnections: integer('RELAY_MAX_CONNECTIONS', 24, 10000)
  })
  run('iroh-relay', ['--config-path', fileURLToPath(new URL('./relay.toml', import.meta.url))])
} else {
  const http = createServer({ maxHeaderSize: 8192, requestTimeout: 10000 }, (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') proxy(req, res, '/tracker/ready')
    else if (!handle(req, res)) {
      res.writeHead(404)
      res.end()
    }
  })
  http.listen(port)
  server = { close: () => http.close() }
}
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
