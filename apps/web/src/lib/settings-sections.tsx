/**
 * Settings sections metadata — shared by the Settings page content and the
 * workbench's contextual bottom island, which hosts the section nav when
 * Settings is open (0288 master-detail). Kept separate from `settings.tsx` so
 * the sidebar can import the list without pulling in every settings panel.
 */
import {
  Activity,
  Database,
  Eye,
  FlaskConical,
  Info,
  Lightbulb,
  Mic,
  Palette,
  Puzzle,
  ShieldCheck,
  User,
  UserRound,
  Wifi,
  type LucideIcon
} from 'lucide-react'

export type SettingsSection =
  | 'profile'
  | 'appearance'
  | 'labs'
  | 'dictation'
  | 'safety'
  | 'data'
  | 'mirror'
  | 'privacy'
  | 'network'
  | 'plugins'
  | 'tips'
  | 'account'
  | 'about'

export interface SettingsSectionConfig {
  id: SettingsSection
  label: string
  icon: LucideIcon
}

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'labs', label: 'Labs', icon: FlaskConical },
  { id: 'dictation', label: 'Dictation & Meetings', icon: Mic },
  { id: 'safety', label: 'Content & Safety', icon: ShieldCheck },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'mirror', label: 'What we know', icon: Eye },
  { id: 'privacy', label: 'Privacy & Diagnostics', icon: Activity },
  { id: 'network', label: 'Network', icon: Wifi },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'tips', label: 'Tips & tours', icon: Lightbulb },
  { id: 'account', label: 'Account', icon: User },
  { id: 'about', label: 'About', icon: Info }
]

export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'profile'

const SECTION_IDS = new Set(SETTINGS_SECTIONS.map((s) => s.id))

/** Narrow an unknown search value to a valid section (for `validateSearch`). */
export function asSettingsSection(value: unknown): SettingsSection | undefined {
  return typeof value === 'string' && SECTION_IDS.has(value as SettingsSection)
    ? (value as SettingsSection)
    : undefined
}
