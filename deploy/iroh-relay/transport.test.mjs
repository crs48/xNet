import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { startGateway } from './gateway.mjs'
const require = createRequire(new URL('../../apps/electron/package.json', import.meta.url))
const { Endpoint, EndpointAddr, RelayMode, SecretKey, setLogLevel } = require('@number0/iroh')
if (process.env.IROH_DEBUG) setLogLevel('Debug')
const timed = async (promise, ms = 10000) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Transport timed out')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
test(
  'pinned relay and native binding exchange authenticated encrypted QUIC through the gateway',
  { timeout: 45000, skip: !process.env.IROH_RELAY_BIN && !process.env.IROH_TEST_RELAY_URL },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xnet-relay-wire-'))
    const remote = process.env.IROH_TEST_RELAY_URL
    const seeds = remote
      ? JSON.parse(readFileSync(process.env.IROH_TEST_KEYS_FILE, 'utf8'))
      : undefined
    const aKey = seeds ? SecretKey.fromBytes(seeds[0]) : SecretKey.generate(),
      bKey = seeds ? SecretKey.fromBytes(seeds[1]) : SecretKey.generate()
    const hex = (key) => Buffer.from(key.public().toBytes()).toString('hex')
    const gateway = remote
      ? undefined
      : await startGateway({
          directory,
          bootstrap: [hex(aKey), hex(bKey)],
          port: 0,
          host: '127.0.0.1'
        })
    const relay = remote
      ? undefined
      : spawn(
          process.env.IROH_RELAY_BIN,
          ['--config-path', new URL('./relay.toml', import.meta.url).pathname],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        )
    let logs = ''
    relay?.stderr.on('data', (data) => {
      logs += data
    })
    relay?.stdout.on('data', (data) => {
      logs += data
    })
    const url = remote ?? `http://127.0.0.1:${gateway.server.address().port}/`
    const endpoints = []
    const watchers = []
    try {
      if (relay) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        assert.equal(relay.exitCode, null, logs)
      }
      assert.equal((await fetch(new URL('healthz', url))).status, 200)
      const register = async (key, admission) => {
        const endpoint = hex(key),
          timestamp = Date.now()
        const signature = key
          .sign(Array.from(Buffer.from(`xnet/relay-register/1\n${endpoint}\n${timestamp}`)))
          .toString()
        const response = await fetch(new URL('register', url), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, timestamp, signature, admission }),
          signal: AbortSignal.timeout(10000)
        })
        assert.equal(response.status, 204, 'Test bootstrap key must be admitted by the operator')
      }
      await register(aKey)
      const parent = hex(aKey),
        nonce = randomBytes(32).toString('hex'),
        expires = Date.now() + 60000
      await register(bKey, {
        parent,
        nonce,
        expires,
        signature: aKey
          .sign(Array.from(Buffer.from(`xnet/relay-invite/1\n${parent}\n${nonce}\n${expires}`)))
          .toString()
      })
      const make = async (key) => {
        const b = Endpoint.builder()
        b.applyMinimal()
        b.secretKey(key.toBytes())
        b.alpns([[120]])
        b.relayMode(RelayMode.customFromUrls([url]))
        const endpoint = await b.bind()
        endpoints.push(endpoint)
        await timed(
          new Promise((resolve, reject) => {
            watchers.push(
              endpoint.watchHomeRelay((error, urls) => {
                // Native 1.2.0 is error-first, unlike its TypeScript declaration.
                if (error) reject(error)
                else if (!Array.isArray(urls)) reject(new Error('Invalid native relay update'))
                else if (urls.includes(url)) resolve()
              })
            )
          })
        )
        return endpoint
      }
      const a = await make(aKey),
        b = await make(bKey)
      const receiving = (async () => {
        const incoming = await b.acceptNext()
        const connection = await (await incoming.accept()).connect()
        const stream = await connection.acceptBi()
        const data = await stream.recv.readToEnd(100)
        await stream.send.writeAll(data)
        await stream.send.finish()
        await stream.send.stopped()
        return {
          data: Buffer.from(data).toString(),
          remote: Buffer.from(connection.remoteId().toBytes()).toString('hex')
        }
      })()
      const connection = await timed(a.connect(new EndpointAddr(b.id(), url, []), [120]))
      const stream = await connection.openBi()
      await stream.send.writeAll(Array.from(Buffer.from('encrypted hello')))
      await stream.send.finish()
      assert.equal(
        Buffer.from(await timed(stream.recv.readToEnd(100))).toString(),
        'encrypted hello'
      )
      assert.deepEqual(await timed(receiving), { data: 'encrypted hello', remote: hex(aKey) })
      assert.equal(
        connection.paths().some((path) => path.isRelay),
        true
      )
      connection.close(0n, [])
      const outsider = await (async () => {
        const b = Endpoint.builder()
        b.applyMinimal()
        b.relayMode(RelayMode.customFromUrls([url]))
        return b.bind()
      })()
      endpoints.push(outsider)
      let outsiderOnline = false
      watchers.push(
        outsider.watchHomeRelay((error, urls) => {
          if (!error && Array.isArray(urls) && urls.length > 0) outsiderOnline = true
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
      assert.equal(outsiderOnline, false, 'Unregistered device must not join the relay')
    } catch (error) {
      console.error(logs)
      throw error
    } finally {
      watchers.forEach((watcher) => watcher.stop())
      await Promise.all(endpoints.map((endpoint) => endpoint.close()))
      relay?.kill('SIGTERM')
      if (relay && relay.exitCode === null) await once(relay, 'exit')
      await gateway?.close()
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
