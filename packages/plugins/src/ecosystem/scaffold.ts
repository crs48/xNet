/**
 * @xnetjs/plugins — plugin project scaffolder (exploration 0192).
 *
 * The pure core behind `create-xnet-plugin`: given a small spec, produce the
 * full set of project files (manifest, tests, package.json, README) as a
 * path→content map. Keeping it pure means it's unit-testable without touching
 * disk; a thin CLI writes the map out.
 *
 * Templates mirror the authoring tracks in the explorations: `client`
 * (contributions only), `two-sided` (client + a hub feature + declared
 * capabilities), `ai-script` (a script-backed slash command), and `connector`
 * (0196 — sync an external service into governed nodes + expose agent tools).
 */

import type { ModuleCapabilities } from '../feature-module'

export type ScaffoldTemplate = 'client' | 'two-sided' | 'ai-script' | 'connector'

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
const TEMPLATES: readonly ScaffoldTemplate[] = ['client', 'two-sided', 'ai-script', 'connector']

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
const MODULE_BODIES: Record<Exclude<ScaffoldTemplate, 'connector'>, (s: ScaffoldSpec) => string> = {
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

/** `dev.xnet.connector.slack` → `SLACK` (an env-prefix-safe token). */
function lastSegmentToken(id: string): string {
  return (id.split('.').pop() ?? id).replace(/-/g, '_')
}

/** The connector template emits a `defineConnector(...)` project (exploration 0196). */
function connectorIndexSource(spec: ScaffoldSpec): string {
  const ctor = pascalCase(spec.id)
  const envPrefix = lastSegmentToken(spec.id).toUpperCase()
  const toolName = lastSegmentToken(spec.id).toLowerCase()
  const schema = `xnet://${spec.id}/Item@1.0.0`
  return `import { defineConnector } from '@xnetjs/plugins'

/**
 * ${spec.name} — an xNet Connector (exploration 0196). Syncs an external service
 * into governed nodes and exposes agent tools over them. The token lives in the
 * hub broker (never handed to the agent); writes are space-scoped + schema-guarded.
 */
const SCHEMA = '${schema}'

export const ${ctor}Connector = defineConnector({
  id: '${spec.id}',
  name: '${spec.name}',
  version: '0.1.0',${spec.author ? `\n  author: '${spec.author}',` : ''}
  capabilities: {
    secrets: ['${envPrefix}_TOKEN'], // held by the hub broker
    schemaWrite: [SCHEMA], // what this connector may materialize
    network: ['api.example.com'] // hosts it may reach (closed by default)
  },
  sync: {
    schemas: [SCHEMA],
    pull: async ({ env, fetch, store, space }) => {
      // 'fetch' is host-allowlisted; 'store' is schema-guarded + space-stamped.
      const res = await fetch('https://api.example.com/items', {
        headers: { authorization: \`Bearer \${env.${envPrefix}_TOKEN}\` }
      })
      const items = ((await (res as { json(): Promise<unknown> }).json()) ??
        []) as Array<{ text: string }>
      for (const item of items) {
        await store.create({ schemaId: SCHEMA, properties: { text: item.text, space } })
      }
      return { written: items.length }
    }
  },
  agentTools: [
    {
      id: '${spec.id}.search',
      name: '${toolName}_search',
      description: 'Search the synced ${spec.name} items the current user can read.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      invoke: async () => {
        // Wire a policy-evaluated read over the synced nodes here.
        return []
      }
    }
  ]
})
`
}

function connectorTestSource(spec: ScaffoldSpec): string {
  const ctor = pascalCase(spec.id)
  return `import { describe, it, expect } from 'vitest'
import { createTestPluginHarness } from '@xnetjs/plugins'
import { ${ctor}Connector } from './index'

describe('${spec.name}', () => {
  it('defines a connector whose module installs and activates', async () => {
    expect(${ctor}Connector.module.hub?.featureId).toBe('${spec.id}.sync')
    const harness = createTestPluginHarness()
    await harness.install(${ctor}Connector.module)
    expect(harness.registry.get('${spec.id}')?.status).toBe('active')
  })
})
`
}

function indexSource(spec: ScaffoldSpec): string {
  if (spec.template === 'connector') return connectorIndexSource(spec)
  const ctor = pascalCase(spec.id)
  return `import { defineFeatureModule } from '@xnetjs/plugins'

export const ${ctor}Module = defineFeatureModule({
  id: '${spec.id}',
  name: '${spec.name}',
  version: '0.1.0',${spec.author ? `\n  author: '${spec.author}',` : ''}
  description: '${spec.description ?? `${spec.name} — an xNet plugin`}',
${MODULE_BODIES[spec.template](spec)}
})
`
}

function testSource(spec: ScaffoldSpec): string {
  if (spec.template === 'connector') return connectorTestSource(spec)
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
  return {
    files: {
      'package.json': packageJson(spec),
      'tsconfig.json': tsconfig(),
      'src/index.ts': indexSource(spec),
      'src/index.test.ts': testSource(spec),
      'README.md': readme(spec)
    }
  }
}
