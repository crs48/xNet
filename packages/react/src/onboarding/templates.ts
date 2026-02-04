/**
 * @xnet/react/onboarding - Quick-start content templates
 */

export interface QuickStartTemplate {
  id: string
  name: string
  description: string
  icon: string
}

export const QUICK_START_TEMPLATES: QuickStartTemplate[] = [
  {
    id: 'blank-page',
    name: 'Blank Page',
    description: 'Start from scratch',
    icon: 'file'
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Template for taking meeting notes',
    icon: 'users'
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Database for tracking tasks',
    icon: 'kanban'
  },
  {
    id: 'canvas',
    name: 'Whiteboard',
    description: 'Infinite canvas for visual thinking',
    icon: 'pen-tool'
  }
]
