/**
 * Plugin Command — scaffold a new xNet plugin project (exploration 0192).
 *
 * `xnet plugin scaffold <id>` writes a ready-to-edit plugin project (manifest,
 * install/activate test, package.json, README) using the pure `scaffoldPlugin`
 * core from `@xnetjs/plugins`. The file-writing is a thin, injectable shell so
 * it can be unit-tested without touching disk.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { scaffoldPlugin, type ScaffoldTemplate } from '@xnetjs/plugins'
import { Command } from 'commander'

interface ScaffoldCliOptions {
  name?: string
  template?: string
  author?: string
  description?: string
  out?: string
}

const TEMPLATES: readonly ScaffoldTemplate[] = ['client', 'two-sided', 'ai-script']

/** Minimal filesystem surface, injectable for tests. */
export interface ScaffoldIO {
  mkdir(path: string): void
  writeFile(path: string, content: string): void
}

const nodeIO: ScaffoldIO = {
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  writeFile: (path, content) => writeFileSync(path, content, 'utf-8')
}

/**
 * Write a scaffold result under `targetDir`, creating parent directories.
 * Returns the list of written paths (relative to `targetDir`).
 */
export function writeScaffoldFiles(
  files: Record<string, string>,
  targetDir: string,
  io: ScaffoldIO = nodeIO
): string[] {
  const written: string[] = []
  for (const [rel, content] of Object.entries(files)) {
    const full = join(targetDir, rel)
    io.mkdir(dirname(full))
    io.writeFile(full, content)
    written.push(rel)
  }
  return written
}

function resolveTemplate(value: string | undefined): ScaffoldTemplate {
  const template = (value ?? 'client') as ScaffoldTemplate
  if (!TEMPLATES.includes(template)) {
    throw new Error(`Unknown template "${value}". Use one of: ${TEMPLATES.join(', ')}`)
  }
  return template
}

function scaffoldCommand(id: string, options: ScaffoldCliOptions): void {
  const template = resolveTemplate(options.template)
  const { files } = scaffoldPlugin({
    id,
    name: options.name ?? id,
    template,
    author: options.author,
    description: options.description
  })
  const targetDir = resolve(process.cwd(), options.out ?? id)
  const written = writeScaffoldFiles(files, targetDir)
  console.log(`Scaffolded ${template} plugin "${id}" at ${targetDir}`)
  for (const rel of written) console.log(`  + ${rel}`)
  console.log('\nNext: cd into the project, `npm install`, then `npm test`.')
}

export function registerPluginCommand(program: Command): void {
  const plugin = program.command('plugin').description('Author and manage xNet plugins')

  plugin
    .command('scaffold <id>')
    .description('Scaffold a new plugin project (id is reverse-domain, e.g. com.acme.kanban)')
    .option('--name <name>', 'Human-readable plugin name')
    .option('--template <template>', `Template: ${TEMPLATES.join(' | ')}`, 'client')
    .option('--author <author>', 'Author name')
    .option('--description <text>', 'Short description')
    .option('--out <dir>', 'Output directory (default: the plugin id)')
    .action((id: string, opts: ScaffoldCliOptions) => {
      try {
        scaffoldCommand(id, opts)
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}
