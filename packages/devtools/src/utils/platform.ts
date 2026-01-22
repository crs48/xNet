/**
 * Platform detection utilities
 */

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI
}

export function isExpo(): boolean {
  return typeof navigator !== 'undefined' && /Expo|React Native/i.test(navigator.userAgent)
}

export function isWeb(): boolean {
  return typeof window !== 'undefined' && !isElectron() && !isExpo()
}

export function isMobile(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}
