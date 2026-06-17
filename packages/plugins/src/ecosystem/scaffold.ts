/**
 * @xnetjs/plugins — plugin project scaffolder (exploration 0192).
 *
 * The pure core behind `create-xnet-plugin`: given a small spec, produce the
 * full set of project files (manifest, tests, package.json, README) as a
 * path→content map. Keeping it pure means it's unit-testable without touching
 * disk; a thin CLI writes the map out.
 *
 * Three templates mirror the three authoring tracks in the exploration:
 * `client` (contributions only), `two-sided` (client + a hub feature + declared
 * capabilities), and `ai-script` (a script-backed slash command).
 */

import type { ModuleCapabilities } from '../feature-module'
import type { PluginPricing } from '../manifest'
import { DEFAULT_PLUGIN_LICENSE, pluginLicenseText } from './license-policy'

export type ScaffoldTemplate = 'client' | 'two-sided' | 'ai-script'

export interface ScaffoldSpec {
  /** Reverse-domain plugin id, e.g. `com.acme.kanban`. */
  id: string
  /** Human-readable name. */
  name: string
  /** Which starter template to generate. */
  template: ScaffoldTemplate
  author?: string
  description?: string
  /** Declared capability grant (two-sided templates surface this in the manifest). */
  capabilities?: ModuleCapabilities
  /** SPDX license id (exploration 0196). Defaults to FSL-1.1-MIT. */
  license?: string
  /** Monetization (exploration 0196). When paid, the manifest declares `pricing`. */
  pricing?: PluginPricing
  /** Publisher DID for paid plugins (exploration 0196). */
  publisherDid?: string
  /** Copyright year for the generated LICENSE (defaults supplied by the caller). */
  year?: number
}

export interface ScaffoldResult {
  /** Project files keyed by relative path. */
  files: Record<string, string>
}

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScaffoldError'
  }
}

const ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i
const TEMPLATES: readonly ScaffoldTemplate[] = ['client', 'two-sided', 'ai-script']

function validateSpec(spec: ScaffoldSpec): void {
  if (!spec.id || !ID_RE.test(spec.id)) {
    throw new ScaffoldError(`id must be reverse-domain (got: ${JSON.stringify(spec.id)})`)
  }
  if (!spec.name) throw new ScaffoldError('name is required')
  if (!TEMPLATES.includes(spec.template)) {
    throw new ScaffoldError(`unknown template: ${spec.template}`)
  }
}

/** `com.acme.kanban-board` → `KanbanBoard` (a safe JS identifier). */
export function pascalCase(id: string): string {
  const tail = id.split('.').pop() ?? id
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** `com.acme.kanban` → `acme-kanban` (an npm-safe package name). */
export function packageName(id: string): string {
  return id.replace(/^[^.]+\./, '').replace(/\./g, '-')
}

function packageJson(spec: ScaffoldSpec): string {
  return `${JSON.stringify(
    {
      name: packageName(spec.id),
      version: '0.1.0',
      description: spec.description ?? `${spec.name} — an xNet plugin`,
      license: spec.license ?? DEFAULT_PLUGIN_LICENSE,
      type: 'module',
      main: 'src/index.ts',
      scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      peerDependencies: { '@xnetjs/plugins': '*' },
      devDependencies: { typescript: '^5.0.0', vitest: '^2.0.0' }
    },
    null,
    2
  )}\n`
}

function tsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true
      },
      include: ['src']
    },
    null,
    2
  )}\n`
}

/** The body of the FeatureModule per template (kept in a lookup to bound complexity). */
const MODULE_BODIES: Record<ScaffoldTemplate, (s: ScaffoldSpec) => string> = {
  client: (s) => `  contributes: {
    commands: [
      {
        id: 'hello',
        name: 'Say hello',
        description: 'A starter command',
        execute: () => {
          console.log('Hello from ${s.name}!')
        }
      }
    ]
  }`,
  'two-sided': (s) => `  // The hub half is registered under the same id and mounted at /x/<id>.
  hub: { featureId: '${s.id}' },
  capabilities: ${JSON.stringify(s.capabilities ?? { schemaWrite: ['xnet://xnet.fyi/Task@*'] })},
  contributes: {
    commands: [
      {
        id: 'sync',
        name: 'Sync with ${s.name}',
        description: 'Call the hub half mounted at /x/${s.id}',
        execute: async () => {
          // fetch the plugin's own guarded endowment here
        }
      }
    ]
  }`,
  'ai-script': (s) => `  contributes: {
    commands: [
      {
        id: 'run-script',
        name: 'Run ${s.name} script',
        description: 'Execute the AI-authored script (see scriptToPluginManifest)',
        execute: () => {
          // Replace with scriptToPluginManifest() output, or run via the sandbox.
        }
      }
    ]
  }`
}

function indexSource(spec: ScaffoldSpec): string {
  const ctor = pascalCase(spec.id)
  const license = spec.license ?? DEFAULT_PLUGIN_LICENSE
  const pricing = spec.pricing ? `\n  pricing: ${JSON.stringify(spec.pricing)},` : ''
  const publisher = spec.publisherDid ? `\n  publisherDid: '${spec.publisherDid}',` : ''
  return `import { defineFeatureModule } from '@xnetjs/plugins'

export const ${ctor}Module = defineFeatureModule({
  id: '${spec.id}',
  name: '${spec.name}',
  version: '0.1.0',${spec.author ? `\n  author: '${spec.author}',` : ''}
  description: '${spec.description ?? `${spec.name} — an xNet plugin`}',
  license: '${license}',${pricing}${publisher}
${MODULE_BODIES[spec.template](spec)}
})
`
}

function testSource(spec: ScaffoldSpec): string {
  const ctor = pascalCase(spec.id)
  return `import { describe, it, expect } from 'vitest'
import { createTestPluginHarness } from '@xnetjs/plugins'
import { ${ctor}Module } from './index'

describe('${spec.name}', () => {
  it('installs and activates', async () => {
    const harness = createTestPluginHarness()
    await harness.install(${ctor}Module)
    expect(harness.registry.get('${spec.id}')?.status).toBe('active')
  })
})
`
}

function readme(spec: ScaffoldSpec): string {
  return `# ${spec.name}

${spec.description ?? `${spec.name} — an xNet plugin.`}

\`\`\`bash
npm install
npm test       # runs the install/activate test via @xnetjs/plugins test harness
npm run typecheck
\`\`\`

Template: \`${spec.template}\`. Edit \`src/index.ts\` to add contributions, then
publish to the marketplace or share the manifest directly.
`
}

/**
 * Scaffold a plugin project as a path→content map. Pure: write the result to
 * disk with a thin CLI, or assert on it in tests.
 *
 * @throws {ScaffoldError} if the spec is invalid.
 */
export function scaffoldPlugin(spec: ScaffoldSpec): ScaffoldResult {
  validateSpec(spec)
  const files: Record<string, string> = {
    'package.json': packageJson(spec),
    'tsconfig.json': tsconfig(),
    'src/index.ts': indexSource(spec),
    'src/index.test.ts': testSource(spec),
    'README.md': readme(spec)
  }
  // Emit a real LICENSE for the recognized licenses (FSL variants + MIT) so a
  // published plugin satisfies the marketplace license-policy CI check (0196).
  const year = spec.year ?? new Date().getFullYear()
  const license = pluginLicenseText(
    spec.license ?? DEFAULT_PLUGIN_LICENSE,
    year,
    spec.author ?? spec.name
  )
  if (license) files['LICENSE'] = license
  return { files }
}
