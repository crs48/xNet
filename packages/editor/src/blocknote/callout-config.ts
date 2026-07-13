/**
 * Callout types and configuration.
 */

export type CalloutType = 'info' | 'tip' | 'warning' | 'caution' | 'note' | 'quote'

export interface CalloutConfig {
  icon: string
  label: string
  bgClass: string
  borderClass: string
  iconClass: string
  titleClass: string
}

export const CALLOUT_CONFIGS: Record<CalloutType, CalloutConfig> = {
  info: {
    icon: '\u2139\uFE0F',
    label: 'Info',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-500',
    titleClass: 'text-blue-700 dark:text-blue-300'
  },
  tip: {
    icon: '\uD83D\uDCA1',
    label: 'Tip',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    borderClass: 'border-green-200 dark:border-green-800',
    iconClass: 'text-green-500',
    titleClass: 'text-green-700 dark:text-green-300'
  },
  warning: {
    icon: '\u26A0\uFE0F',
    label: 'Warning',
    bgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
    iconClass: 'text-yellow-500',
    titleClass: 'text-yellow-700 dark:text-yellow-300'
  },
  caution: {
    icon: '\uD83D\uDEA8',
    label: 'Caution',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    borderClass: 'border-red-200 dark:border-red-800',
    iconClass: 'text-red-500',
    titleClass: 'text-red-700 dark:text-red-300'
  },
  note: {
    icon: '\uD83D\uDCDD',
    label: 'Note',
    bgClass: 'bg-gray-50 dark:bg-gray-800',
    borderClass: 'border-gray-200 dark:border-gray-700',
    iconClass: 'text-gray-500',
    titleClass: 'text-gray-700 dark:text-gray-300'
  },
  quote: {
    icon: '\uD83D\uDCAC',
    label: 'Quote',
    bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    borderClass: 'border-purple-200 dark:border-purple-800',
    iconClass: 'text-purple-500',
    titleClass: 'text-purple-700 dark:text-purple-300'
  }
}
