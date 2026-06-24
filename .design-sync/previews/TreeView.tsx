import { TreeView, type TreeNode } from '@xnetjs/ui'
import {
  FolderOpen,
  Hash,
  FileText,
  Users,
  Settings,
  Layers3
} from 'lucide-react'

const nodes: TreeNode[] = [
  {
    id: 'workspace',
    label: 'Acme Engineering',
    icon: <FolderOpen className="h-4 w-4" />,
    badge: 'workspace',
    defaultExpanded: true,
    children: [
      {
        id: 'channels',
        label: 'Channels',
        icon: <Hash className="h-4 w-4" />,
        badge: '3',
        defaultExpanded: true,
        children: [
          { id: 'general', label: 'general', icon: <Hash className="h-4 w-4" /> },
          { id: 'design', label: 'design', icon: <Hash className="h-4 w-4" /> },
          { id: 'incidents', label: 'incidents', icon: <Hash className="h-4 w-4" /> }
        ]
      },
      {
        id: 'docs',
        label: 'Documents',
        icon: <Layers3 className="h-4 w-4" />,
        defaultExpanded: true,
        children: [
          { id: 'roadmap', label: 'Q3 Roadmap', icon: <FileText className="h-4 w-4" /> },
          { id: 'rfc', label: 'RFC: Sync protocol', icon: <FileText className="h-4 w-4" /> }
        ]
      },
      { id: 'people', label: 'People', icon: <Users className="h-4 w-4" />, badge: '14' },
      { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> }
    ]
  }
]

export const Workspace = () => (
  <div className="max-w-xs rounded-lg border border-border bg-background p-3">
    <TreeView nodes={nodes} selectedId="design" />
  </div>
)
