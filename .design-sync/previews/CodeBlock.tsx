import { CodeBlock } from '@xnetjs/ui'

const tsSample = [
  "import { defineSchema, text, ref } from '@xnetjs/data'",
  '',
  'export const Channel = defineSchema({',
  "  id: 'channel',",
  '  fields: {',
  '    name: text({ required: true }),',
  '    topic: text(),',
  "    space: ref('space', { cascade: true })",
  '  }',
  '})',
  '',
  'export function openChannel(id: string): void {',
  '  store.dispatch(setActiveChannel(id))',
  '}'
].join('\n')

const shellSample = [
  '$ pnpm -F @xnetjs/ui build',
  '✓ tsc --emitDeclarationOnly  (1.2s)',
  '✓ vite build                 (3.8s)',
  '$ node scripts/build-plugin-index.mjs --validate',
  '✓ 41 registry entries valid',
  '✓ thin-index written to registry/registry.json'
].join('\n')

export const TypeScript = () => (
  <div className="max-w-2xl">
    <CodeBlock code={tsSample} language="typescript" maxHeight={260} />
  </div>
)

export const Shell = () => (
  <div className="max-w-2xl">
    <CodeBlock code={shellSample} language="bash" maxHeight={180} />
  </div>
)
