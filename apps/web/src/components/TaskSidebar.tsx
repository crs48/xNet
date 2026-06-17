/**
 * TaskSidebar - Linear-style in-surface left navigation for Tasks.
 *
 * A secondary pane (not a second global sidebar): Views (All / My Issues /
 * Triage) over the workspace task collection, then the Projects list. Desktop
 * only — on compact widths the top-bar tabs take over.
 */
import type { JSX, ReactNode } from 'react'
import { Hash, Inbox, List, Plus, User } from 'lucide-react'

export type TaskView = 'all' | 'mine' | 'triage'

export interface TaskSidebarProject {
  id: string
  name?: string
  icon?: string
}

export interface TaskSidebarProps {
  view: TaskView
  /** Active project scope, or null when a View is active */
  activeProjectId: string | null
  projects: TaskSidebarProject[]
  onSelectView: (view: TaskView) => void
  onSelectProject: (projectId: string) => void
  onCreateProject: () => void
  className?: string
}

const VIEWS: Array<{ id: TaskView; label: string; icon: JSX.Element }> = [
  { id: 'all', label: 'All Issues', icon: <List size={14} /> },
  { id: 'mine', label: 'My Issues', icon: <User size={14} /> },
  { id: 'triage', label: 'Triage', icon: <Inbox size={14} /> }
]

export function TaskSidebar({
  view,
  activeProjectId,
  projects,
  onSelectView,
  onSelectProject,
  onCreateProject,
  className
}: TaskSidebarProps): JSX.Element {
  return (
    <nav
      data-testid="task-sidebar"
      className={`w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-background-subtle/40 p-2 ${className ?? ''}`}
    >
      <Section label="Views">
        {VIEWS.map(({ id, label, icon }) => (
          <NavRow
            key={id}
            icon={icon}
            label={label}
            active={!activeProjectId && view === id}
            onClick={() => onSelectView(id)}
          />
        ))}
      </Section>

      <Section
        label="Projects"
        action={
          <button
            type="button"
            aria-label="New project"
            onClick={onCreateProject}
            className="rounded p-0.5 text-foreground-muted transition-colors hover:bg-background-muted hover:text-foreground"
          >
            <Plus size={13} />
          </button>
        }
      >
        {projects.length === 0 && (
          <div className="px-2 py-1 text-xs text-foreground-subtle">No projects</div>
        )}
        {projects.map((project) => (
          <NavRow
            key={project.id}
            icon={
              project.icon ? (
                <span className="text-sm leading-none">{project.icon}</span>
              ) : (
                <Hash size={14} />
              )
            }
            label={project.name || 'Untitled project'}
            active={activeProjectId === project.id}
            onClick={() => onSelectProject(project.id)}
          />
        ))}
      </Section>
    </nav>
  )
}

function Section({
  label,
  action,
  children
}: {
  label: string
  action?: JSX.Element
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
          {label}
        </span>
        {action}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function NavRow({
  icon,
  label,
  active,
  onClick
}: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        active
          ? 'bg-accent text-foreground'
          : 'text-foreground-muted hover:bg-background-muted hover:text-foreground'
      }`}
    >
      <span className="shrink-0 text-foreground-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}
