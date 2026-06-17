/**
 * Connector Command — scaffold a new xNet Connector project (exploration 0196).
 *
 * `xnet connector scaffold <id>` writes a ready-to-edit Connector project: a
 * `defineConnector(...)` module (capabilities + a sync adapter + an agent tool)
 * plus an install/activate test, package.json, and README. Reuses the pure
 * `scaffoldPlugin` core (the `connector` template) and the shared file-writing
 * shell from the `plugin` command, so it stays unit-testable without disk.
 */

import { resolve } from 'node:path'
import { scaffoldPlugin } from '@xnetjs/plugins'
import { Command } from 'commander'
import { writeScaffoldFiles } from './plugin.js'

interface ConnectorScaffoldOptions {
  name?: string
  author?: string
  description?: string
  out?: string
}

function scaffoldConnector(id: string, options: ConnectorScaffoldOptions): void {
  const { files } = scaffoldPlugin({
    id,
    name: options.name ?? id,
    template: 'connector',
    author: options.author,
    description: options.description
  })
  const targetDir = resolve(process.cwd(), options.out ?? id)
  const written = writeScaffoldFiles(files, targetDir)
  console.log(`Scaffolded connector "${id}" at ${targetDir}`)
  for (const rel of written) console.log(`  + ${rel}`)
  console.log(
    '\nNext: cd in, `npm install`, `npm test`. Then fill in the sync `pull` and ' +
      'register the hub half with `connectorSyncFeature` (see @xnetjs/hub).'
  )
}

export function registerConnectorCommand(program: Command): void {
  const connector = program
    .command('connector')
    .description('Author agent-native Connectors (sync an external service into governed nodes)')

  connector
    .command('scaffold <id>')
    .description(
      'Scaffold a Connector project (id is reverse-domain, e.g. dev.acme.connector.slack)'
    )
    .option('--name <name>', 'Human-readable connector name')
    .option('--author <author>', 'Author name')
    .option('--description <text>', 'Short description')
    .option('--out <dir>', 'Output directory (default: the connector id)')
    .action((id: string, opts: ConnectorScaffoldOptions) => {
      try {
        scaffoldConnector(id, opts)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}
