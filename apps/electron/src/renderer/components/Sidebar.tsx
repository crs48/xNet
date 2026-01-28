/**
 * Sidebar Component
 *
 * Shows document list with icons for different types.
 * Also renders plugin-contributed sidebar items.
 */

import React, { useState, useMemo, type ComponentType } from 'react'
import * as icons from 'lucide-react'
import {
  FileText,
  Database,
  Layout,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Link,
  Settings
} from 'lucide-react'
import type { Document } from '../lib/types'
import type { SidebarContribution } from '@xnet/plugins'

interface SidebarProps {
  documents: Document[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreate: (type: Document['type']) => void
  onAddShared: () => void
  /** Plugin-contributed sidebar items */
  pluginItems?: SidebarContribution[]
  /** Handler for settings navigation */
  onSettings?: () => void
}

const typeIcons = {
  page: FileText,
  database: Database,
  canvas: Layout
} as const

const typeLabels: Record<Document['type'], string> = {
  page: 'Page',
  database: 'Database',
  canvas: 'Canvas'
}

/**
 * Render an icon from a string name or component
 */
function renderIcon(icon: string | ComponentType, size = 14, className = ''): React.ReactNode {
  if (typeof icon !== 'string') {
    const IconComp = icon
    return <IconComp />
  }

  // Convert kebab-case to PascalCase for Lucide lookup
  const iconName = icon
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  // Look up in lucide-react (cast to any to avoid complex Lucide types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (icons as any)[iconName] as
    | React.ComponentType<{ size?: number; className?: string }>
    | undefined
  if (IconComponent) {
    return <IconComponent size={size} className={className} />
  }

  // Fallback to Circle
  return <icons.Circle size={size} className={className} />
}

export function Sidebar({
  documents,
  selectedId,
  onSelect,
  onDelete,
  onCreate,
  onAddShared,
  pluginItems = [],
  onSettings
}: SidebarProps) {
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<Document['type'], boolean>>({
    page: true,
    database: true,
    canvas: true
  })

  // Sort plugin items by priority and group by position
  const sortedPluginItems = useMemo(() => {
    const sorted = [...pluginItems].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    return {
      top: sorted.filter((i) => i.position === 'top' || !i.position),
      bottom: sorted.filter((i) => i.position === 'bottom'),
      sections: sorted.filter((i) => i.position === 'section')
    }
  }, [pluginItems])

  // Group section items by section name
  const sectionGroups = useMemo(() => {
    const groups = new Map<string, SidebarContribution[]>()
    for (const item of sortedPluginItems.sections) {
      const section = item.section ?? 'Other'
      if (!groups.has(section)) groups.set(section, [])
      groups.get(section)!.push(item)
    }
    return groups
  }, [sortedPluginItems.sections])

  // Group documents by type
  const groupedDocs = documents.reduce(
    (acc, doc) => {
      const type = doc.type || 'page'
      if (!acc[type]) acc[type] = []
      acc[type].push(doc)
      return acc
    },
    {} as Record<Document['type'], Document[]>
  )

  const toggleSection = (type: Document['type']) => {
    setExpandedSections((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const handleCreate = (type: Document['type']) => {
    onCreate(type)
    setShowCreateMenu(false)
  }

  return (
    <aside className="w-[250px] bg-secondary border-r border-border flex flex-col">
      {/* Create button */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white border-none px-4 py-2 rounded-md cursor-pointer text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            <span>New</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${showCreateMenu ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Create menu dropdown */}
          {showCreateMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-10 py-1">
              <button
                onClick={() => handleCreate('page')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <FileText size={14} />
                <span>Page</span>
              </button>
              <button
                onClick={() => handleCreate('database')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <Database size={14} />
                <span>Database</span>
              </button>
              <button
                onClick={() => handleCreate('canvas')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <Layout size={14} />
                <span>Canvas</span>
              </button>
              <hr className="my-1 border-border" />
              <button
                onClick={() => {
                  setShowCreateMenu(false)
                  onAddShared()
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-primary"
              >
                <Link size={14} />
                <span>Add Shared...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-auto p-2">
        {(['page', 'database', 'canvas'] as Document['type'][]).map((type) => {
          const docs = groupedDocs[type] || []
          if (docs.length === 0) return null

          const Icon = typeIcons[type]
          const isExpanded = expandedSections[type]

          return (
            <div key={type} className="mb-2">
              {/* Section header */}
              <button
                onClick={() => toggleSection(type)}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="uppercase font-medium tracking-wider">{typeLabels[type]}s</span>
                <span className="ml-auto opacity-50">{docs.length}</span>
              </button>

              {/* Documents */}
              {isExpanded && (
                <ul className="list-none p-0 m-0">
                  {docs.map((doc) => (
                    <li
                      key={doc.id}
                      onClick={() => onSelect(doc.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group transition-colors ${
                        selectedId === doc.id ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                    >
                      <Icon size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate flex-1">{doc.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(doc.id)
                        }}
                        className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        {documents.length === 0 && (
          <p className="text-muted-foreground text-sm text-center mt-8">No documents yet</p>
        )}

        {/* Plugin section groups */}
        {[...sectionGroups.entries()].map(([section, items]) => (
          <div key={section} className="mb-2">
            <div className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="uppercase font-medium tracking-wider">{section}</span>
            </div>
            <ul className="list-none p-0 m-0">
              {items.map((item) => (
                <PluginSidebarItem key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom items (plugin + settings) */}
      <div className="p-2 border-t border-border">
        {/* Plugin bottom items */}
        {sortedPluginItems.bottom.map((item) => (
          <PluginSidebarItem key={item.id} item={item} />
        ))}

        {/* Settings */}
        {onSettings && (
          <button
            onClick={onSettings}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
          >
            <Settings size={14} className="text-muted-foreground" />
            <span className="text-sm">Settings</span>
          </button>
        )}
      </div>
    </aside>
  )
}

/**
 * Render a plugin sidebar item
 */
function PluginSidebarItem({ item }: { item: SidebarContribution }) {
  const badge = item.badge?.()

  const handleClick = () => {
    if (typeof item.action === 'function') {
      item.action()
    } else {
      // Route navigation - would need router integration
      console.log('[Sidebar] Navigate to:', item.action)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
    >
      {renderIcon(item.icon, 14, 'text-muted-foreground flex-shrink-0')}
      <span className="text-sm truncate flex-1">{item.name}</span>
      {badge != null && (
        <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  )
}
