import { spawn } from 'node:child_process'
import { createPublicKey, verify } from 'node:crypto'
import {
  mkdirSync,
  existsSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync
} from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const hex = (value, size) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value)
export function signatureValid(endpoint, message, signature) {
  if (!hex(endpoint, 64) || !hex(signature, 128)) return false
  try {
    const key = createPublicKey({
      format: 'der',
      type: 'spki',
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(endpoint, 'hex')
      ])
    })
    return verify(null, Buffer.from(message), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
export function authorizeRegistration(input, state, bootstrap, now = Date.now()) {
  if (
    !input ||
    !Number.isSafeInteger(input.timestamp) ||
    Math.abs(input.timestamp - now) > 300_000 ||
    !signatureValid(
      input.endpoint,
      `xnet/relay-register/1\n${input.endpoint}\n${input.timestamp}`,
      input.signature
    )
  )
    throw new Error('Invalid registration proof')
  if (state.endpoints.includes(input.endpoint)) return state
  if (state.endpoints.length >= 32) throw new Error('Relay membership is full')
  if (bootstrap.includes(input.endpoint))
    return { ...state, endpoints: [...state.endpoints, input.endpoint] }
  const a = input.admission
  if (
    !a ||
    !state.endpoints.includes(a.parent) ||
    !hex(a.nonce, 64) ||
    (a.maxUses !== undefined && (!Number.isInteger(a.maxUses) || a.maxUses < 1 || a.maxUses > 8)) ||
    !Number.isSafeInteger(a.expires) ||
    a.expires <= now ||
    a.expires > now + 24 * 3600_000 ||
    !signatureValid(
      a.parent,
      a.maxUses === undefined
        ? `xnet/relay-invite/1\n${a.parent}\n${a.nonce}\n${a.expires}`
        : `xnet/relay-invite/2\n${a.parent}\n${a.nonce}\n${a.expires}\n${a.maxUses}`,
      a.signature
    )
  )
    throw new Error('An admitted friend must invite this device')
  const used = state.admissions.filter((entry) => entry.nonce === a.nonce)
  if (used.length >= (a.maxUses ?? 1) && !used.some((entry) => entry.endpoint === input.endpoint))
    throw new Error('Invitation already used')
  const admissions = state.admissions.filter((entry) => entry.expires > now)
  if (admissions.filter((entry) => entry.parent === a.parent).length >= 8)
    throw new Error('Invitation rate limit reached')
  return {
    ...state,
    endpoints: [...state.endpoints, input.endpoint],
    admissions: [...admissions, { ...a, endpoint: input.endpoint }]
  }
}
export function createPersistence(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'relay.json')
  let state = { version: 1, endpoints: [], admissions: [], day: '', reserved: 0 }
  if (existsSync(path)) {
    state = JSON.parse(readFileSync(path, 'utf8'))
    if (
      state.version !== 1 ||
      !Array.isArray(state.endpoints) ||
      state.endpoints.length > 32 ||
      !state.endpoints.every((id) => hex(id, 64)) ||
      !Array.isArray(state.admissions) ||
      state.admissions.length > 256 ||
      !Number.isSafeInteger(state.reserved) ||
      state.reserved < 0 ||
      typeof state.day !== 'string'
    )
      throw new Error('Corrupt relay state; refusing to reset quota or membership')
  }
  return {
    get: () => state,
    save(next) {
      const fd = openSync(path + '.tmp', 'w', 0o600)
      try {
        writeFileSync(fd, JSON.stringify(next))
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(path + '.tmp', path)
      const dir = openSync(directory, 'r')
      try {
        fsyncSync(dir)
      } finally {
        closeSync(dir)
      }
      state = next
    }
  }
}
/** Reserve before forwarding. A crash loses unused allowance instead of resetting spend. */
export function createBudget(persistence, limit, now = () => Date.now()) {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1024 * 1024 * 1024)
    throw new Error('Daily relay allowance must be a positive integer of at most 1 GiB')
  let available = 0
  let day = ''
  return (bytes) => {
    const today = new Date(now()).toISOString().slice(0, 10)
    if (today !== day) {
      day = today
      available = 0
    }
    const state = persistence.get()
    const reserved = state.day === day ? state.reserved : 0
    if (bytes > available) {
      const reserve = Math.max(bytes - available, Math.min(512 * 1024, limit - reserved))
      if (reserve <= 0 || reserved + reserve > limit) return false
      persistence.save({ ...state, day, reserved: reserved + reserve })
      available += reserve
    }
    available -= bytes
    return true
  }
}
export async function startGateway(config) {
  const persistence = createPersistence(config.directory)
  const budget = createBudget(persistence, config.dailyBytes ?? 64 * 1024 * 1024)
  const bootstrap = config.bootstrap ?? []
  if (!bootstrap.length || !bootstrap.every((id) => hex(id, 64)))
    throw new Error('Set BOOTSTRAP_ENDPOINTS to the first trusted device public keys')
  const revoked = new Set(config.revoked ?? [])
  if (![...revoked].every((id) => hex(id, 64)) || bootstrap.some((id) => revoked.has(id)))
    throw new Error('Revoked endpoint keys must be valid and cannot also be bootstrap keys')
  const saved = persistence.get()
  persistence.save({
    ...saved,
    endpoints: saved.endpoints.filter((id) => !revoked.has(id)),
    admissions: saved.admissions.filter((a) => !revoked.has(a.endpoint) && !revoked.has(a.parent))
  })
  const sockets = new Set()
  let minute = 0,
    requests = 0
  let relayAlive = true
  const relayReady = () =>
    new Promise((resolve) => {
      const probe = httpRequest(
        { host: '127.0.0.1', port: config.relayPort ?? 3340, path: '/healthz', timeout: 1000 },
        (response) => {
          response.resume()
          resolve(response.statusCode === 200)
        }
      )
      probe.on('timeout', () => probe.destroy())
      probe.on('error', () => resolve(false))
      probe.end()
    })
  const access = createServer((req, res) => {
    const id = req.headers['x-iroh-endpoint-id']
    const allowed =
      req.method === 'POST' &&
      req.url === '/access' &&
      relayAlive &&
      (persistence.get().endpoints.includes(id) || bootstrap.includes(id))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(allowed))
  })
  await new Promise((resolve, reject) => {
    access.once('error', reject)
    access.listen(config.accessPort ?? 3341, '127.0.0.1', resolve)
  })
  const gate = () => {
    const current = Math.floor(Date.now() / 60000)
    if (current !== minute) {
      minute = current
      requests = 0
    }
    return ++requests <= 120
  }
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 },
    async (req, res) => {
      if (config.handleHttp?.(req, res)) return
      if (!gate()) {
        req.destroy()
        return
      }
      if (req.method === 'GET' && req.url === '/capabilities') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ reusableAdmissions: true, maxUses: 8 }))
        return
      }
      if (req.method === 'GET' && req.url === '/healthz') {
        const state = persistence.get()
        const ready =
          relayAlive &&
          !(
            state.day === new Date().toISOString().slice(0, 10) &&
            state.reserved >= (config.dailyBytes ?? 64 * 1024 * 1024)
          ) &&
          (await relayReady())
        res.writeHead(ready ? 200 : 503, {
          'content-type': 'application/json',
          'cache-control': 'no-store'
        })
        res.end(
          JSON.stringify({
            status: ready ? 'ready' : 'unavailable',
            transport: 'iroh',
            access: 'invite-only'
          })
        )
        return
      }
      if (req.method === 'GET' && ['/ping', '/generate_204'].includes(req.url)) {
        const proxy = httpRequest(
          {
            host: '127.0.0.1',
            port: config.relayPort ?? 3340,
            path: req.url,
            headers: req.headers,
            timeout: 3000
          },
          (upstream) => {
            res.writeHead(upstream.statusCode ?? 502, upstream.headers)
            upstream.pipe(res)
          }
        )
        proxy.on('timeout', () => proxy.destroy())
        proxy.on('error', () => {
          if (!res.headersSent) res.writeHead(503)
          res.end()
        })
        proxy.end()
        return
      }
      if (req.method !== 'POST' || req.url !== '/register') {
        res.writeHead(404)
        res.end()
        return
      }
      try {
        const chunks = []
        let length = 0
        for await (const chunk of req) {
          length += chunk.length
          if (length > 4096) {
            req.destroy()
            return
          }
          chunks.push(chunk)
        }
        const input = JSON.parse(Buffer.concat(chunks).toString())
        if (revoked.has(input?.endpoint)) throw new Error('This device has been revoked')
        const state = authorizeRegistration(input, persistence.get(), bootstrap)
        persistence.save(state)
        res.writeHead(204)
        res.end()
      } catch {
        if (!res.destroyed) {
          res.writeHead(403)
          res.end()
        }
      }
    }
  )
  server.on('upgrade', (req, socket, head) => {
    if (!relayAlive || !gate() || sockets.size >= (config.maxConnections ?? 24) || req.url !== '/relay') {
      socket.destroy()
      return
    }
    sockets.add(socket)
    socket.setTimeout(90000, () => socket.destroy())
    const upstream = httpRequest({
      host: '127.0.0.1',
      port: config.relayPort ?? 3340,
      path: '/relay',
      headers: { ...req.headers, host: '127.0.0.1' },
      timeout: 5000
    })
    const cleanup = () => {
      sockets.delete(socket)
      upstream.destroy()
    }
    socket.on('close', cleanup)
    socket.on('error', cleanup)
    upstream.on('timeout', () => socket.destroy())
    upstream.on('error', () => socket.destroy())
    upstream.on('response', () => socket.destroy())
    upstream.on('upgrade', (response, target, targetHead) => {
      const headers = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${Object.entries(
        response.headers
      )
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n')}\r\n\r\n`
      if (!budget(Buffer.byteLength(headers) + head.length + targetHead.length)) {
        target.destroy()
        socket.destroy()
        return
      }
      socket.write(headers)
      if (head.length) target.write(head)
      if (targetHead.length) socket.write(targetHead)
      const forward = (source, destination, data) => {
        if (!budget(data.length)) {
          source.destroy()
          destination.destroy()
          return
        }
        if (!destination.write(data)) source.pause()
      }
      socket.on('data', (data) => forward(socket, target, data))
      target.on('data', (data) => forward(target, socket, data))
      socket.on('drain', () => target.resume())
      target.on('drain', () => socket.resume())
      target.on('error', () => socket.destroy())
      target.on('close', () => socket.destroy())
      socket.on('close', () => target.destroy())
    })
    upstream.end()
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port ?? 8080, config.host ?? '0.0.0.0', resolve)
  })
  return {
    server,
    access,
    fail: () => {
      relayAlive = false
      for (const socket of sockets) socket.destroy()
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      access.closeAllConnections()
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => access.close(resolve))
      ])
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.env.RELAY_DATA_DIR ?? '/data'
  const bootstrap = (process.env.BOOTSTRAP_ENDPOINTS ?? '').split(',').filter(Boolean)
  const gateway = await startGateway({
    directory,
    bootstrap,
    revoked: (process.env.REVOKED_ENDPOINTS ?? '').split(',').filter(Boolean),
    port: Number(process.env.PORT ?? 8080),
    dailyBytes: Number(process.env.DAILY_RELAY_BYTES ?? 67108864)
  })
  const child = spawn(
    process.env.IROH_RELAY_BIN ?? '/usr/local/bin/iroh-relay',
    ['--config-path', new URL('./relay.toml', import.meta.url).pathname],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  )
  child.on('error', (error) => {
    console.error('Relay could not start:', error.message)
    gateway.fail()
    process.exitCode = 1
    void gateway.close()
  })
  child.on('exit', (code) => {
    gateway.fail()
    process.exitCode = code || 1
    void gateway.close()
  })
  const shutdown = () => {
    gateway.fail()
    child.kill('SIGTERM')
    void gateway.close()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
