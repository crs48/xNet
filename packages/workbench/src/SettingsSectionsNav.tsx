/**
 * SettingsSectionsNav — the Settings section list, hosted in the workbench's
 * contextual bottom island when Settings is open (0288). Selecting a section
 * drives the `/settings?section=…` URL; the section content renders in the main
 * area (settings route), keeping list-left / content-right consistent.
 */
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSection
} from './lib/settings-sections'
import { useNavigateTo, useSearch } from './platform'
import { NavRow } from './sidebar/NavRow'

export function SettingsSectionsNav() {
  const navigate = useNavigateTo()
  const active = (useSearch() as { section?: SettingsSection }).section ?? DEFAULT_SETTINGS_SECTION

  return (
    <div className="flex flex-col gap-px overflow-y-auto px-2 py-1">
      {SETTINGS_SECTIONS.map((section) => (
        <NavRow
          key={section.id}
          icon={section.icon}
          label={section.label}
          active={active === section.id}
          testId={`settings-${section.id}`}
          onClick={() =>
            navigate({ kind: 'path', path: '/settings' }, { search: { section: section.id } })
          }
        />
      ))}
    </div>
  )
}
