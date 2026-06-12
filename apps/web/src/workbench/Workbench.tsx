/**
 * Workbench — the fixed-region shell (exploration 0166).
 *
 * Rail · Left Panel · Editor Area · Right Panel · Bottom Panel ·
 * Status Bar. Every region except the editor area collapses; Cmd+.
 * toggles zen (chrome hidden, layout snapshot restored on exit).
 * Panel sizes persist via react-resizable-panels' useDefaultLayout;
 * everything else persists in the useWorkbench store.
 */
import type { ReactNode } from 'react'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels'
import { GlobalSearch } from '../components/GlobalSearch'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { useWorkbenchCommands, useZenEscape } from './commands'
import { ContextPanel } from './ContextPanel'
import { EditorArea } from './EditorArea'
import { Hairline } from './Hairline'
import { PanelViewHost } from './PanelViewHost'
import { Rail } from './Rail'
import { useWorkbench } from './state'
import { StatusBar } from './StatusBar'
import { registerInterimPanelViews } from './views/interim'

registerInterimPanelViews()

export function Workbench({ children }: { children: ReactNode }) {
  const mode = useWorkbench((state) => state.mode)
  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const bottom = useWorkbench((state) => state.bottom)
  const { isDemo, limits } = useDemoMode()

  useWorkbenchCommands()
  useZenEscape()

  const horizontal = useDefaultLayout({
    id: 'xnet:wb:layout-h',
    panelIds: [...(left.open ? ['left'] : []), 'center', ...(right.open ? ['right'] : [])]
  })
  const vertical = useDefaultLayout({
    id: 'xnet:wb:layout-v',
    panelIds: ['editor', ...(bottom.open ? ['bottom'] : [])]
  })

  if (mode === 'zen') {
    return (
      <div className="flex h-dvh flex-col bg-surface-0 text-ink-1">
        <WorkspaceCommands />
        <GlobalSearch trigger="none" />
        <main className="min-h-0 flex-1">
          <EditorArea>{children}</EditorArea>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-surface-1 text-ink-1">
      <WorkspaceCommands />
      <GlobalSearch trigger="none" />
      {isDemo && limits && <DemoBanner evictionHours={limits.evictionHours} />}

      <div className="flex min-h-0 flex-1">
        <Rail />
        <Group
          orientation="horizontal"
          id="xnet-wb-h"
          defaultLayout={horizontal.defaultLayout}
          onLayoutChanged={horizontal.onLayoutChanged}
        >
          {left.open && (
            <>
              <Panel id="left" defaultSize={280} minSize={200} maxSize={420}>
                <PanelViewHost slot="left" />
              </Panel>
              <Hairline orientation="horizontal" id="sep-left" />
            </>
          )}
          <Panel id="center" minSize="30%">
            <Group
              orientation="vertical"
              id="xnet-wb-v"
              defaultLayout={vertical.defaultLayout}
              onLayoutChanged={vertical.onLayoutChanged}
            >
              <Panel id="editor" minSize="30%">
                <EditorArea>{children}</EditorArea>
              </Panel>
              {bottom.open && (
                <>
                  <Hairline orientation="vertical" id="sep-bottom" />
                  <Panel id="bottom" defaultSize={240} minSize={120} maxSize="60%">
                    <PanelViewHost slot="bottom" />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {right.open && (
            <>
              <Hairline orientation="horizontal" id="sep-right" />
              <Panel id="right" defaultSize={320} minSize={240} maxSize={520}>
                <ContextPanel />
              </Panel>
            </>
          )}
        </Group>
      </div>

      <StatusBar />
    </div>
  )
}
