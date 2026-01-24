/**
 * Mobile detection and utility functions for the editor.
 *
 * Provides platform detection for iOS/Android and haptic feedback support.
 */

/**
 * Detect if the current device is a mobile device (phone or tablet).
 */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Detect if the current device is running iOS.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Detect if the current device is running Android.
 */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/**
 * Trigger haptic feedback on supported devices.
 *
 * Uses the Vibration API on Android and falls back to a no-op on iOS
 * (iOS does not support the Vibration API in browsers).
 *
 * @param duration - Vibration duration in milliseconds (default: 10)
 */
export function hapticFeedback(duration: number = 10): void {
  if (typeof navigator === 'undefined') return
  if (navigator.vibrate) {
    navigator.vibrate(duration)
  }
}

/**
 * Check if the device supports touch input.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * Get the safe area insets for devices with notches/dynamic islands.
 * Returns CSS env() values that can be used in styles.
 */
export function getSafeAreaInsets(): {
  top: string
  right: string
  bottom: string
  left: string
} {
  return {
    top: 'env(safe-area-inset-top, 0px)',
    right: 'env(safe-area-inset-right, 0px)',
    bottom: 'env(safe-area-inset-bottom, 0px)',
    left: 'env(safe-area-inset-left, 0px)'
  }
}
