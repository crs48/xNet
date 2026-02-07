/**
 * Accessibility Module
 *
 * Keyboard navigation, screen reader support, and high contrast mode.
 */

// Keyboard Navigation
export {
  KeyboardNavigator,
  createKeyboardNavigator,
  type NavigableNode,
  type NavigationSpatialIndex,
  type KeyboardNavigationOptions
} from './keyboard-navigation'

// Screen Reader Announcer
export { Announcer, createAnnouncer, getAnnouncer, type AnnouncerNode } from './announcer'

// High Contrast Mode
export {
  useHighContrast,
  useReducedMotion,
  isHighContrastEnabled,
  isReducedMotionPreferred,
  HIGH_CONTRAST_STYLES,
  type HighContrastStyles
} from './high-contrast'
