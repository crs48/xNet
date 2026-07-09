/**
 * SettingsSectionsNav — the Settings section list, hosted in the workbench's
 * contextual bottom island when Settings is open (0288). Selecting a section
 * drives the `/settings?section=…` URL; the section content renders in the main
 * area (settings route), keeping list-left / content-right consistent.
 */
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSection
} from '../lib/settings-sections'

export function SettingsSectionsNav() {
  const navigate = useNavigate()
  const active =
    useRouterState({
      select: (state) => (state.location.search as { section?: SettingsSection }).section
    }) ?? DEFAULT_SETTINGS_SECTION

  return (
    <div className="flex flex-col gap-px overflow-y-auto px-2 py-1">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon
        const isActive = active === section.id
        return (
          <button
            key={section.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => void navigate({ to: '/settings', search: { section: section.id } })}
            className={`flex w-full items-center gap-2.5 rounded-lg border-none px-2 py-1.5 text-left text-[13px] transition-colors cursor-pointer ${
              isActive
                ? 'bg-accent font-medium text-ink-1'
                : 'bg-transparent text-ink-2 hover:bg-background-muted'
            }`}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
          </button>
        )
      })}
    </div>
  )
}
