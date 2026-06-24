/**
 * DevTools default configuration values
 */

export const DEFAULTS = {
  /** Ring buffer capacity */
  MAX_EVENTS: 10_000,
  /** Interval for polling store conflicts */
  CONFLICT_POLL_MS: 2_000,
  /** Default panel height in pixels (tall enough for the Data table's toolbar +
   *  rows and for GridToolbar's popovers to open without being cramped). */
  PANEL_HEIGHT: 400,
  /** Minimum panel height */
  PANEL_MIN_HEIGHT: 20,
  /** Keyboard shortcut to toggle devtools */
  KEYBOARD_SHORTCUT: { key: 'd', ctrl: true, shift: true },
  /** Number of fingers for mobile tap toggle */
  MOBILE_FINGER_COUNT: 4
} as const
