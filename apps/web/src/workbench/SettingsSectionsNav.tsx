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
import { NavRow } from './sidebar/NavRow'

export function SettingsSectionsNav() {
  const navigate = useNavigate()
  const active =
    useRouterState({
      select: (state) => (state.location.search as { section?: SettingsSection }).section
    }) ?? DEFAULT_SETTINGS_SECTION

  return (
    <div className="flex flex-col gap-px overflow-y-auto px-2 py-1">
      {SETTINGS_SECTIONS.map((section) => (
        <NavRow
          key={section.id}
          icon={section.icon}
          label={section.label}
          active={active === section.id}
          testId={`settings-${section.id}`}
          onClick={() => void navigate({ to: '/settings', search: { section: section.id } })}
        />
      ))}
    </div>
  )
}
