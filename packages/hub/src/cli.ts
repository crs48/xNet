/**
 * @xnet/hub - CLI entry point.
 */

import type { HubConfig } from './types'
import { Command } from 'commander'
import { createHub } from './index'
import { registerShutdownHandlers } from './lifecycle/shutdown'
import { DEFAULT_CONFIG } from './types'

const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const run = async (): Promise<void> => {
  const program = new Command()
    .name('xnet-hub')
    .description('xNet Hub - signaling, sync relay, backup, and query server')
    .version('0.0.1')
    .option('-p, --port <number>', 'port to listen on', String(DEFAULT_CONFIG.port))
    .option('-d, --data <path>', 'data directory', DEFAULT_CONFIG.dataDir)
    .option('--no-auth', 'disable UCAN authentication (anonymous mode)')
    .option('--storage <type>', 'storage backend (sqlite|memory)', DEFAULT_CONFIG.storage)
    .option(
      '--max-connections <number>',
      'max concurrent connections',
      String(DEFAULT_CONFIG.maxConnections)
    )
    .option(
      '--max-blob-size <number>',
      'max backup blob size in bytes',
      String(DEFAULT_CONFIG.maxBlobSize)
    )
    .option(
      '--awareness-ttl <number>',
      'awareness entry TTL in ms',
      String(DEFAULT_CONFIG.awarenessTtlMs)
    )
    .option(
      '--awareness-cleanup <number>',
      'awareness cleanup interval in ms',
      String(DEFAULT_CONFIG.awarenessCleanupIntervalMs)
    )
    .option(
      '--awareness-max-users <number>',
      'max awareness users per room',
      String(DEFAULT_CONFIG.awarenessMaxUsers)
    )
    .option('--log-level <level>', 'log level (debug|info|warn|error)', DEFAULT_CONFIG.logLevel)
    .action(async (opts) => {
      const config: Partial<HubConfig> = {
        port: parseNumber(opts.port, DEFAULT_CONFIG.port),
        dataDir: opts.data,
        auth: opts.auth !== false,
        storage: opts.storage,
        maxConnections: parseNumber(opts.maxConnections, DEFAULT_CONFIG.maxConnections),
        maxBlobSize: parseNumber(opts.maxBlobSize, DEFAULT_CONFIG.maxBlobSize),
        awarenessTtlMs: parseNumber(opts.awarenessTtl, DEFAULT_CONFIG.awarenessTtlMs),
        awarenessCleanupIntervalMs: parseNumber(
          opts.awarenessCleanup,
          DEFAULT_CONFIG.awarenessCleanupIntervalMs
        ),
        awarenessMaxUsers: parseNumber(opts.awarenessMaxUsers, DEFAULT_CONFIG.awarenessMaxUsers),
        logLevel: opts.logLevel
      }

      const hub = await createHub(config)

      registerShutdownHandlers(async () => {
        console.log('\nShutting down...')
        await hub.stop()
      })

      await hub.start()
      console.log(`xNet Hub listening on port ${hub.port}`)
      console.log(`  WebSocket: ws://localhost:${hub.port}`)
      console.log(`  Health:    http://localhost:${hub.port}/health`)
      console.log(`  Auth:      ${config.auth ? 'UCAN' : 'anonymous'}`)
      console.log(`  Storage:   ${config.storage} (${config.dataDir})`)
    })

  await program.parseAsync(process.argv)
}

void run()
