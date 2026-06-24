import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@xnetjs/ui'
import { FileText, Folder, MoreHorizontal } from 'lucide-react'

// Layout primitive — composed inside a fixed-height bordered box so the
// drag handle and both panes are visible in the card.
export const Default = () => (
  <div className="h-72 overflow-hidden rounded-lg border border-border">
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize={36} minSize={24}>
        <div className="h-full space-y-1 bg-background-subtle p-3">
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Files
          </p>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <Folder className="h-4 w-4 text-foreground-muted" />
            src
          </div>
          <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-sm text-accent-foreground">
            <FileText className="h-4 w-4" />
            index.ts
          </div>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <FileText className="h-4 w-4 text-foreground-muted" />
            store.ts
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={64}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">index.ts</p>
              <p className="text-xs text-foreground-muted">Drag the handle to resize panes.</p>
            </div>
            <MoreHorizontal className="h-4 w-4 text-foreground-muted" />
          </div>
          <div className="flex-1 p-3 text-sm text-foreground-muted">
            The preview shell renders the editor pane here. Resizable panels keep their proportions
            as the layout grows or shrinks.
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
)
