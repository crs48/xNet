import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Blocks,
  BookOpen,
  ChevronRight,
  FileCode2,
  FolderOpen,
  GitBranch,
  Layers3,
  Search,
  Sparkles,
  Zap
} from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../primitives/Button'
import {
  CatalogCard,
  CatalogGrid,
  CatalogPage,
  CatalogSection,
  InlinePreview
} from '../storybook/Catalog'
import { CodeBlock } from './CodeBlock'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import { DataTable, type Column } from './DataTable'
import { KeyValue } from './KeyValue'
import { LogEntry } from './LogEntry'
import { StatusDot } from './StatusDot'
import { ThemeToggle } from './ThemeToggle'
import { TreeView, type TreeNode } from './TreeView'

const meta = {
  title: 'UI/Composed/Devtools Catalog',
  component: ThemeToggle,
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type MetricRow = {
  name: string
  value: string
  owner: string
}

const commandPaletteCommands: PaletteCommand[] = [
  {
    id: 'open-stories',
    name: 'Open Stories',
    description: 'Switch the embedded preview to the Storybook manager.',
    icon: 'layers',
    shortcut: '⇧⌘S',
    group: 'Navigation',
    execute: () => undefined
  },
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Jump to the shared settings surface.',
    icon: 'settings',
    shortcut: '⌘,',
    group: 'Navigation',
    execute: () => undefined
  },
  {
    id: 'profile-component',
    name: 'Profile Component',
    description: 'Open the performance panel for the current story.',
    icon: 'zap',
    group: 'Diagnostics',
    execute: () => undefined
  }
]

const builtinCommands: PaletteCommand[] = [
  {
    id: 'search-everywhere',
    name: 'Search Everywhere',
    description: 'Open global search across stories and workspaces.',
    icon: 'search',
    shortcut: '⌘K',
    group: 'Built in',
    execute: () => undefined
  }
]

const metricColumns: Column<MetricRow>[] = [
  { key: 'name', label: 'Metric' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'owner', label: 'Owner', align: 'right' }
]

const metricRows: MetricRow[] = [
  { name: 'INP', value: '78ms', owner: 'Canvas' },
  { name: 'CLS', value: '0.00', owner: 'Layout' },
  { name: 'Mount duration', value: '12ms', owner: 'React Profiler' },
  { name: 'Long tasks', value: '0', owner: 'Main thread' }
]

const treeNodes: TreeNode[] = [
  {
    id: 'workspace',
    label: 'OpenCode workspace',
    icon: <FolderOpen className="h-4 w-4" />,
    badge: 'dev',
    defaultExpanded: true,
    children: [
      {
        id: 'stories',
        label: 'Storybook',
        icon: <Layers3 className="h-4 w-4" />,
        badge: '6006',
        defaultExpanded: true,
        children: [
          { id: 'primitives', label: 'Primitives', icon: <Blocks className="h-4 w-4" /> },
          { id: 'components', label: 'Components', icon: <BookOpen className="h-4 w-4" /> },
          { id: 'devtools', label: 'Devtools', icon: <Zap className="h-4 w-4" /> }
        ]
      },
      {
        id: 'preview',
        label: 'Preview app',
        icon: <Sparkles className="h-4 w-4" />,
        badge: '5173'
      }
    ]
  }
]

function createPerformanceRows(count: number): MetricRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Rendered component ${String(index + 1).padStart(3, '0')}`,
    value: `${(6 + (index % 13)) * 3}ms`,
    owner: index % 4 === 0 ? 'Profiler' : 'Canvas'
  }))
}

function createLogMessages(count: number): Array<{
  id: number
  direction: 'in' | 'out' | 'success'
  message: string
  detail: string
}> {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    direction: index % 8 === 0 ? 'success' : index % 6 === 0 ? 'in' : 'out',
    message: `story:${index % 11 === 0 ? 'ui/components/catalog' : 'ui/composed/devtools'} rendered`,
    detail: `${6 + (index % 5)}ms`
  }))
}

function DevtoolsCatalogShowcase(): ReactElement {
  const [selectedNodeId, setSelectedNodeId] = useState('stories')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const logMessages = useMemo(() => createLogMessages(64), [])

  const codeSample = useMemo(
    () =>
      [
        'export function openStoriesSurface(): void {',
        '  startTransition(() => {',
        "    setActiveSurface({ kind: 'stories' })",
        '  })',
        '}',
        '',
        'window.xnetStorybook.ensure().then(({ state, url }) => {',
        "  if (state === 'ready' && url) {",
        '    setStorybookUrl(url)',
        '  }',
        '})'
      ].join('\n'),
    []
  )

  return (
    <CatalogPage
      title="Devtools and diagnostics catalog"
      description="Tree views, command surfaces, logs, metrics, and profiler-oriented stories. This is the layer where Storybook starts behaving like part of the xNet IDE instead of an external site."
    >
      <CatalogSection
        title="Operational building blocks"
        description="Status, metadata, and code snippets used across sync panels and diagnostics views."
      >
        <CatalogGrid>
          <CatalogCard
            title="Theme, status, metadata, and code"
            description="Compact components that appear repeatedly in panels, inspectors, and developer tooling."
          >
            <InlinePreview className="items-center">
              <ThemeToggle />
              <StatusDot status="connected" label="Connected" />
              <StatusDot status="syncing" label="Syncing" />
              <StatusDot status="error" label="Error" />
              <StatusDot status="connecting" label="Starting" />
            </InlinePreview>

            <div className="rounded-xl border border-border bg-background-subtle p-4">
              <KeyValue label="Workspace" value="OpenCode" mono copyable />
              <KeyValue label="Branch" value="codex/embedded-storybook" mono copyable />
              <KeyValue
                label="Runtime"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="h-3.5 w-3.5" />
                    Electron + Web
                  </span>
                }
              />
            </div>

            <CodeBlock code={codeSample} maxHeight={220} />
          </CatalogCard>

          <CatalogCard
            title="Tree view and logs"
            description="Both components are sensitive to density, text truncation, and token consistency, so the catalog keeps them visible side-by-side."
          >
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-xl border border-border bg-background-subtle p-3">
                <TreeView
                  nodes={treeNodes}
                  selectedId={selectedNodeId}
                  onSelect={setSelectedNodeId}
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-background-subtle">
                {logMessages.slice(0, 10).map((entry) => (
                  <LogEntry
                    key={entry.id}
                    timestamp={Date.now() - entry.id * 1_000}
                    direction={entry.direction as 'in' | 'out' | 'success'}
                    message={entry.message}
                    detail={entry.detail}
                  />
                ))}
              </div>
            </div>
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>

      <CatalogSection
        title="Commanding and metrics"
        description="Command palette and tabular diagnostics surfaces are exercised together because they are usually opened from the same shell context."
      >
        <CatalogGrid>
          <CatalogCard
            title="Command palette"
            description="Storybook itself now behaves like an IDE surface, so the palette needs to reach it directly."
          >
            <InlinePreview>
              <Button
                leftIcon={<Search className="h-4 w-4" />}
                onClick={() => setPaletteOpen(true)}
              >
                Open command palette
              </Button>
            </InlinePreview>
            <div className="rounded-xl border border-border bg-background-subtle p-4 text-sm text-foreground-muted">
              Open the palette to inspect the same keyboard-driven interaction model used in the
              Electron shell.
            </div>

            <CommandPalette
              commands={commandPaletteCommands}
              builtinCommands={builtinCommands}
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
            />
          </CatalogCard>

          <CatalogCard
            title="Data table"
            description="Compact tabular output for profiler summaries, sync metrics, and transport health."
          >
            <DataTable columns={metricColumns} data={metricRows} />
          </CatalogCard>
        </CatalogGrid>
      </CatalogSection>
    </CatalogPage>
  )
}

function PerformanceLabShowcase(): ReactElement {
  const largeRows = useMemo(() => createPerformanceRows(240), [])
  const largeLogMessages = useMemo(() => createLogMessages(64), [])
  const elementTimingProps = { elementtiming: 'performance-lab-hero' } as {
    elementtiming: string
  }

  return (
    <CatalogPage
      title="Performance lab"
      description="Use the Performance panel in Canvas mode for this story. The table, log stream, and tree view create enough work to make layout shifts, React mount duration, and interaction timing visible."
    >
      <CatalogSection
        title="Heavy render surface"
        description="This story is intentionally dense so the GitHub performance panel has something non-trivial to measure."
      >
        <div
          {...elementTimingProps}
          className="rounded-3xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-2xl font-semibold">Storybook instrumentation benchmark</h2>
              <p className="text-sm text-foreground-muted">
                Profile story mount, command latency, and scrolling behavior from the addon tray.
              </p>
            </div>
            <InlinePreview className="border-none bg-transparent p-0">
              <StatusDot status="syncing" label="Profiling" />
              <StatusDot status="connected" label="Stable frame budget" />
              <ThemeToggle />
            </InlinePreview>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-border bg-background-subtle p-4">
              <TreeView
                nodes={[
                  {
                    id: 'root',
                    label: 'Performance suite',
                    icon: <Zap className="h-4 w-4" />,
                    defaultExpanded: true,
                    children: Array.from({ length: 20 }, (_, parentIndex) => ({
                      id: `suite-${parentIndex}`,
                      label: `Suite ${parentIndex + 1}`,
                      icon: <ChevronRight className="h-4 w-4" />,
                      defaultExpanded: parentIndex < 2,
                      children: Array.from({ length: 6 }, (_, childIndex) => ({
                        id: `suite-${parentIndex}-${childIndex}`,
                        label: `Scenario ${parentIndex + 1}.${childIndex + 1}`,
                        icon: <FileCode2 className="h-4 w-4" />
                      }))
                    }))
                  }
                ]}
                selectedId="suite-1-3"
              />
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background-subtle p-4">
                <DataTable columns={metricColumns} data={largeRows} compact />
              </div>
              <div className="rounded-2xl border border-border bg-background-subtle p-4">
                <CodeBlock
                  maxHeight={180}
                  code={Array.from(
                    { length: 80 },
                    (_, index) => `renderStory(${index}, metrics[${index % 7}])`
                  ).join('\n')}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-background-subtle">
              {largeLogMessages.map((entry) => (
                <LogEntry
                  key={entry.id}
                  timestamp={Date.now() - entry.id * 850}
                  direction={entry.direction as 'in' | 'out' | 'success'}
                  message={entry.message}
                  detail={entry.detail}
                />
              ))}
            </div>
          </div>
        </div>
      </CatalogSection>
    </CatalogPage>
  )
}

export const Overview: Story = {
  render: () => <DevtoolsCatalogShowcase />
}

export const PerformanceLab: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Open the ⚡ Performance panel in Canvas view and interact with the tree or scroll the log column. This story is the intentionally heavy benchmark surface for local diagnostics.'
      }
    }
  },
  render: () => <PerformanceLabShowcase />
}
