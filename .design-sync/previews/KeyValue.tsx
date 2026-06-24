import { KeyValue } from '@xnetjs/ui'
import { GitBranch } from 'lucide-react'

export const NodeMetadata = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-4">
    <KeyValue label="Node ID" value="cid:blake3:9f2a…c41e" mono copyable />
    <KeyValue label="Schema" value="document" mono />
    <KeyValue label="Author" value="did:key:z6Mkf…7Qp2" mono copyable />
    <KeyValue label="Lamport" value="1284" mono />
    <KeyValue label="Updated" value="2026-06-23 14:08:02 UTC" mono />
  </div>
)

export const WorkspaceInfo = () => (
  <div className="max-w-2xl rounded-lg border border-border bg-background p-4">
    <KeyValue label="Workspace" value="Acme Engineering" copyable />
    <KeyValue label="Branch" value="claude/embedded-storybook" mono copyable />
    <KeyValue label="Members" value="14 people" />
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
)
